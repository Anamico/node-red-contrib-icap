const async = require('async');

module.exports = function(RED) {

    function Check(config) {
        RED.nodes.createNode(this, config);

        var node = this;
        node._icap = RED.nodes.getNode(config.icap);

        node.status({ fill: "yellow", shape: "dot", text: "Registering Handler" });

        node.handleRequest = function() {
        };

        node.handleResponse = function() {
        };

        var error = node._icap.registerHandler(config.checkType, config.step, node);

        if (error) {
            node.status({ fill: "red", shape: "dot", text: error });
            return;
        }
        node.status({ fill: "green", shape: "dot", text: "Registered" });
    }
    RED.nodes.registerType("icap check", Check);
};
