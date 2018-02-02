'use strict';

var fs = require("fs");
var Q = require('q');

module.exports.saveFileJson = saveFileJson;
module.exports.sortMetaData = sortMetaData;
module.exports.htmlTableFromArray = htmlTableFromArray;
module.exports.plainIdsFromObjects = plainIdsFromObjects;
module.exports.idsFromIndicatorFormula = idsFromIndicatorFormula;
module.exports.idsFromFormula = idsFromFormula;
module.exports.arrayRemoveDuplicates = arrayRemoveDuplicates;
module.exports.arrayMerge = arrayMerge;
module.exports.isArray = isArray;
module.exports.arraySortByProperty = arraySortByProperty;
module.exports.arrayFromKeys = arrayFromKeys;


function saveFileJson(fileName, jsonContent) {
	var deferred = Q.defer();

	//Save file
	var data = JSON.stringify(jsonContent);
	fs.writeFile(fileName + ".json", data, function(err) {
		if(err) {
			return console.log(err);
		}

		console.log("✔ Metadata saved");
		deferred.resolve(true);
	});

	return deferred.promise;
}



function sortMetaData(metaData) {
	var objects = arrayFromKeys(metaData);
	var items;
	for (var i = 0; i < objects.length; i++) {
		if (metaData[objects[i]].length === 0) {
			continue;
		}
		items = metaData[objects[i]];

		if (items[0].hasOwnProperty("name")) {
			metaData[objects[i]] = arraySortByProperty(items, "name", false, false);
		}
	}
	
	return metaData;
}



//Use HTML for tables, so ensure support for newlines etc
function htmlTableFromArray(content, header, columnWidths, alignment) {

	if (content.length < 1 || !columnWidths || columnWidths.length != content[0].length) {
		console.log("Invalid parameters - need at least header");
		return "";
	}

	var tableWidth = 100;
	var table = "\n<table width=\"" + tableWidth + "%\">\n";
	if (columnWidths) {
		for (var i = 0; i < columnWidths.length; i++) {
			table += "\t<col width=\"" + columnWidths[i] + "%\">\n";
		}
	}

	if (header) {
		table += "\t<tr>\n";
		for (var i = 0; i < content[0].length; i++) {
			table += "\t\t<th>" + content[0][i] + "</th>\n";
		}
		table += "\t</tr>\n";
	}

	for (var i = 1; i < content.length; i++) {
		table += "\t<tr>\n";
		for (var j = 0; j < content[i].length; j++) {
			if (alignment) table += "\t\t<td align=\"" + alignment[j] + "\">" + content[i][j] + "</td>\n";
			else table += "\t\t<td>" + content[i][j] + "</td>\n";
		}
		table += "\t</tr>\n";
	}

	table += "</table>\n\n";

	return table;
}



function plainIdsFromObjects(idObjects) {
	var ids = [];
	for (var i = 0; i < idObjects.length; i++) {
		ids.push(idObjects[i].id);
	}
	return ids;
}



function idsFromIndicatorFormula(numeratorFormula, denominatorFormula, dataElementOnly) {

	var matches = arrayMerge(numeratorFormula.match(/#{(.*?)}/g), denominatorFormula.match(/#{(.*?)}/g));
	if (!matches) return [];

	for (var i = 0; i < matches.length; i++ ) {
		matches[i] = matches[i].slice(2, -1);
		if (dataElementOnly) matches[i] = matches[i].split(".")[0];
	}

	return arrayRemoveDuplicates(matches);
}



function idsFromFormula(formula, dataElementOnly) {

	var matches = formula.match(/#{(.*?)}/g);
	if (!matches) return [];

	for (var i = 0; i < matches.length; i++ ) {
		matches[i] = matches[i].slice(2, -1);
		if (dataElementOnly) matches[i] = matches[i].split(".")[0];
	}

	return arrayRemoveDuplicates(matches);
}



function arrayRemoveDuplicates(array, property) {
	var seen = {};
	return array.filter(function(item) {
		if (property) {
			return seen.hasOwnProperty(item[property]) ? false : (seen[item[property]] = true);
		}
		else {
			return seen.hasOwnProperty(item) ? false : (seen[item] = true);
		}
	});
}



function arrayMerge(a, b) {
	if (a && !isArray(a)) a = [a];
	if (b && !isArray(b)) b = [b];

	if (!a && b) return b;
	if (!b && a) return a;

	for (var i = 0;a && b &&  i < b.length; i++) {
		a.push(b[i]);
	}
	return a;
}



function isArray(array) {
	var isArray = Object.prototype.toString.call( array ) === "[object Array]";

	return isArray;
}



function arraySortByProperty(array, property, numeric, reverse) {

	return array.sort(function(a, b) {
		var res;
		if (numeric) {
			res = b[property] - a[property] ;
		}
		else {
			res = a[property] < b[property] ? -1 : 1;
		}
		if (reverse) return -res;
		else return res;
	});

}



function arrayFromKeys(obj) {
	var array = [];
	for (var key in obj) {
		if (obj.hasOwnProperty(key)) {
			array.push(key);
		}
	}
	return array;

}


