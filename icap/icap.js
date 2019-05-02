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
            if (false) {
                console.log(node.id, ',', node.name, ': Starting ICAP server...');
                const port = node.port;
                node.server.listen(function(port) {
                    console.log(node.id, ',', node.name, ': ICAP server listening on port ' + port);
                });
                return;
            }
            console.log('waiting for more nodes');
        }

        /**
         * Register a Request (Check) node to send out requests
         *
         * @param index         There can only be one per index, this is the processing order
         * @param requestNode   The node that is registering the callback
         * @param callback      The callback to send the requests to
         * 
         * @returns null or error
         */
        node.registerRequestNode = function(index, requestNode, callback) {
            const existing = node.requestHandlers[index];
            if (existing) {
                return "Duplicate Request Index";
            }
            node.requestHandlers[index] = {
                node: requestNode,
                callback: callback
            }
            node.startIfFullyConfigured();
            return null;
        };

        /**
         * Register a Response (Check) node to send out responses
         *
         * @param index         There can only be one per index, this is the processing order
         * @param responseNode  The node that is registering the callback
         * @param callback      The callback to send the response to
         * 
         * @returns null or error
         */
        node.registerResponseNode = function(index, responseNode, callback) {
            const existing = node.responseHandlers[index];
            if (existing) {
                return "Duplicate Response Index";
            }
            node.responseHandlers[index] = {
                node: responseNode,
                callback: callback
            }
            node.startIfFullyConfigured();
            return null;
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
        node.server.options('/request', (icapReq, icapRes, next) => {
            icapRes.setIcapStatusCode(200);
            icapRes.setIcapHeaders({
              'Methods': 'REQMOD',
              'Preview': '128'
            });
            icapRes.writeHeaders(false);
            icapRes.end();
        });
          
        // RESPMOD
        node.server.options('/response', (icapReq, icapRes, next) => {
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

        //  whitelist of allowed sites
        // var whitelist = new DomainList();
        // whitelist.addMany([
        //     'whitelisted.example.com', // match fixed domain
        //     '.whitelisted.example.net' // match fixed domain and all subdomains
        // ]);

        //  handlers
        //  accept request/response if domain on whitelist
        // node.server.request('*' /*whitelist*/, node.processRequest);
        // node.server.response('*' /*whitelist*/, node.processResponse);
        
        //  reject otherwise
        // server.request('*', node.rejectRequest);
        // server.response('*', node.rejectRequest);

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
