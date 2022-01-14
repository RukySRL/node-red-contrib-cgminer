var net = require("net");

var cgSendCmd = function (payload, config, node, callback) {
	var tmout = null;
	var dataStg = "";
	var socket;
	var ip = payload.ip || config.ip;
	var port = payload.port || config.port;
	var timeout = payload.timeout || config.timeout;
	try {
		socket = net.connect({ host: ip, port: port }, function () {
			// build data string as it is recieved
			socket.on("data", function (res) {
				dataStg += res.toString();
			});

			// all data recieved from the response. Now pass to callback()
			socket.on("end", function () {
				if (tmout) clearTimeout(tmout);

				socket.removeAllListeners();

				try {
					dataStg = JSON.parse(
						dataStg.replace(/\u0000/g, "").replace(/}{/g, "},{")
					);
				} catch (err) {
					// attempt to parse as an object, but if it fails,
					// just return the string (my miners, for example, don't return proper json)
					node.warn("Error parsing json: " + err);
				}
				callback(dataStg);
			});

			// send false if request times out
			if (timeout) {
				tmout = setTimeout(function () {
					socket.removeAllListeners();
					callback(false);
					return;
				}, Number(timeout));
			}

			// CGMiner can take commands as a simple string (for simple commands) or as json, i.e.: { command: command, parameter: parameter }
			socket.write(payload.command);
		});

		socket.on("error", function (err) {
			if (timeout) {
				callback(false); // send false if time out is set
			}
			socket.removeAllListeners();
			node.error("Net socket error: " + err);
			return null;
		});
	} catch (err) {
		node.error("Error in net socket connection: " + err);
		return null;
	}
};

module.exports = function (RED) {
	RED.nodes.registerType("cgminer", function (config) {
		RED.nodes.createNode(this, config);
		var node = this;
		node.on("input", function (msg) {
			// input can be a simple string representing a command to send to cg miner, or an object (or json) for commands with
			if (typeof msg.payload !== "string")
				msg.payload = JSON.stringify(msg.payload); // paremeters, like this: { command: command, parameter: parameter }
			cgSendCmd(msg.payload, config, node, function (cgMinerData) {
				msg.payload = cgMinerData;
				msg.title = "CGMiner Data"; // see https://github.com/node-red/node-red/wiki/Node-msg-Conventions
				msg.description = "Data from CGMiner";
				node.send(msg); // msg.payload should contain object containing the miner data (or a string, if parsing the object failed)
			});
		});
	});
};
