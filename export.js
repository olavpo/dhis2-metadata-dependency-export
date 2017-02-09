(function(){
	'use strict';

	var Q = require('q');

	var conf = require('./conf/configuration.json');
	var d2 = require('./bin/d2.js');

	run();

	/**
	 * Start the server
	 */
	function run() {
		var deferred = Q.defer();

		map = conf.dataMap;

		getMetadata().then(function(data) {
			getData().then(function (data) {
				processData();
				uploadData().then(function(data) {
					deferred.resolve(true);
				});

			});
		});
		return deferred.promise;
	}


	function template() {
		var deferred = Q.defer();

		deferred.resolve(true);
				
		return deferred.promise;
	
	}

}());