'use strict';

//var request = require('request');
const ICAPServer = require('nodecap2').ICAPServer;
const DomainList = require('nodecap2').DomainList;

module.exports = function(RED) {

    function ICAP(config) {
        RED.nodes.createNode(this, config);

        var node = this;
        node.server = new ICAPServer({
            debug: false
        });
        node.requestHandlers = {};
        node.responseHandlers = {};

        node.startIfFullyConfigured = function() {
            // Start the ICAP server: IF all the routes are registered!
            const requestKeys = Object.keys(node.requestHandlers);
            const responseKeys = Object.keys(node.responseHandlers);

            if ((requestKeys.length != config.requestSteps) || (responseKeys.length != config.responseSteps)) {
                console.log(requestKeys.length + ' of ' + config.requestSteps + ' request steps:' + requestKeys +
                    ' | ' + responseKeys.length + ' of ' + config.responseSteps + ' response steps:' + responseKeys);
                return;
            }
            console.log('All steps registered...');

            console.log(node.id, ',', node.name, ': Starting ICAP server...');
            const port = config.port;
            node.server.listen(function(port) {
                console.log(node.id, ',', node.name, ': ICAP server listening on port ' + port);
                console.log(node.id, ',', node.name, ': request path is /' + config.requestPath);
                console.log(node.id, ',', node.name, ': response path is /' + config.responsePath);
            });
            
            var keys = Object.keys(node.requestHandlers);
            keys.forEach(function(key) {
                const handler = node.requestHandlers[key];
                handler.status({});
            });
            keys = Object.keys(node.responseHandlers);
            keys.forEach(function(key) {
                const handler = node.responseHandlers[key];
                handler.status({});
            });
        }

        /**
         * Register a Request (Check) node to send out requests
         *
         * @param index         There can only be one per index, this is the processing order
         * @param requestNode   The node that is registering as the handler
         * 
         * @returns null or error
         */
        node.registerRequestHandler = function(index, requestNode) {
            const existing = node.requestHandlers[index];
            if (existing) {
                return "Duplicate Request Index";
            }
            node.requestHandlers[index] = requestNode;
            node.startIfFullyConfigured();
            return null;
        };

        /**
         * Register a Response (Check) node to send out responses
         *
         * @param index         There can only be one per index, this is the processing order
         * @param responseNode  The node that is registering as the handler
         * 
         * @returns null or error
         */
        node.registerResponseHandler = function(index, responseNode) {
            const existing = node.responseHandlers[index];
            if (existing) {
                return "Duplicate Response Index";
            }
            node.responseHandlers[index] = responseNode;
            node.startIfFullyConfigured();
            return null;
        };

        /**
         * Register a Response (Check) node to send out responses
         *
         * @param type          "Request" or "Response"
         * @param index         There can only be one per index (per type), this is the processing order
         * @param responseNode  The node that is registering as the handler
         * 
         * @returns null or error
         */
        node.registerHandler = function (checkType, step, handler) {
            if (checkType == 'Request') {
                return this.registerRequestHandler(step, handler);
            }
            return this.registerResponseHandler(step, handler);
        };

        /**
         * Deregister an request handler
         *
         * @param index
         */
        // node.deregisterStateListener = function(listenerNode) {
        //     node.log('deregister: ' + listenerNode.id);
        //     // remove it from ALL possible locations
        //     Object.keys(node.stateListeners).forEach(function(lightName) {
        //         node.stateListeners[lightName] && node.stateListeners[lightName][listenerNode.id] && delete node.stateListeners[lightName][listenerNode.id];
        //     });
        // };

        console.log(node.id, ',', node.name, ': Configuring ICAP server...');

        //  configure options
        //    to have different options for requests and responses,
        //    configure squid to send these to different ICAP resource paths
        // REQMOD
        node.server.options('/' + config.RequestPath, (icapReq, icapRes, next) => {
            icapRes.setIcapStatusCode(200);
            icapRes.setIcapHeaders({
              'Methods': 'REQMOD',
              'Preview': '128'
            });
            icapRes.writeHeaders(false);
            icapRes.end();
        });
          
        // RESPMOD
        node.server.options('/' + config.ResponsePath, (icapReq, icapRes, next) => {
            icapRes.setIcapStatusCode(200);
            icapRes.setIcapHeaders({
              'Methods': 'RESPMOD',
              'Preview': '128',
              'Transfer-Preview': '*',
              'Transfer-Ignore': 'jpg,jpeg,gif,png',
              'Transfer-Complete': '',
              'Max-Connections': '100'
            });
            icapRes.writeHeaders(false);
            icapRes.end();
        });

        //  return error if options path not recognized
        node.server.options('*', function(icapReq, icapRes, next) {
            if (!icapRes.done) {
                icapRes.setIcapStatusCode(404);
                icapRes.writeHeaders(false);
                return icapRes.end();
            }
            next();
        });

        //  helper to process a request
        node.processRequest = function(icapReq, icapRes, req, res) {
            if (!icapRes.hasFilter() && icapReq.hasPreview()) {
                icapRes.allowUnchanged();
                return;
            }
            // only example how are presented multiple headers in request
            req.headers['X-Example'] = ['flag{12345-FirstHeader}', 'second header'];
            // Response will contain two different header:
            // X-Example: flag{12345-FirstHeader}
            // X-Example: second header
        
            icapRes.setIcapStatusCode(200);
            icapRes.setIcapHeaders(icapReq.headers);
            if (icapReq.isReqMod()) {
                icapRes.setHttpMethod(req);
                icapRes.setHttpHeaders(req.headers);
            } else {
                icapRes.setHttpStatus(res.code);
                icapRes.setHttpHeaders(res.headers);
            }
            var hasBody = icapReq.hasBody();
            if (hasBody) {
                icapRes.continuePreview();
            }
            icapRes.writeHeaders(hasBody);
            icapReq.pipe(icapRes);
        };

        //  helper to process a request
        node.processResponse = function(icapReq, icapRes, req, res) {
            node.processRequest(icapReq, icapRes, req, res);
        }

        //  helper to reject a request/response
        // node.rejectRequest = function(icapReq, icapRes, req, res) {
        //     var hasBody = false, headers = {};
        //     // do *not* set Content-Length: causes an issue with Squid
        //     if (req.headers && 'Accept' in req.headers && req.headers['Accept'].indexOf('text') >= 0) {
        //         hasBody = true;
        //         headers['Content-Type'] = 'text/html; charset=UTF-8';
        //     }
        
        //     icapRes.setIcapStatusCode(200);
        //     icapRes.setIcapHeaders(icapReq.headers);
        //     icapRes.setHttpStatus(403);
        //     icapRes.setHttpHeaders(headers);
        //     if (hasBody) {
        //         icapRes.writeHeaders(true);
        //         // only one calling at once.
        //         icapRes.send(errorPage);
        //     } else {
        //         icapRes.writeHeaders(false);
        //     }
        //     // WARNING: don't forget to write.end() after .send()
        //     // or your data will not send.:(
        //     icapRes.end();
        // };

        //  handlers
        //  accept request/response if domain on whitelist
        node.server.request('*' /*whitelist*/, node.processRequest);
        node.server.response('*' /*whitelist*/, node.processResponse);
        
        //  reject otherwise
        // server.request('*', node.rejectRequest);
        // server.response('*', node.rejectRequest);

        //  errors
        //  icap error
        node.server.error(function(err, icapReq, icapRes, next) {
            console.error(err);
            if (!icapRes.done) {
            icapRes.setIcapStatusCode(500);
            icapRes.writeHeaders(false);
            icapRes.end();
            }
            next();
        });
    }

    RED.nodes.registerType("icap", ICAP);
};
