/*jshint esversion: 6 */
"use strict";

var fs = require("fs");
var Q = require("q");
var jsonFormat = require("json-format");
var jsonSort = require("sort-json");
var XLSX = require("xlsx");
var XLSXs = require("xlsx-style");

module.exports.saveFileJson = saveFileJson;
module.exports.sortMetaData = sortMetaData;
module.exports.htmlTableFromArray = htmlTableFromArray;
module.exports.htmlTableFromArrayVertical = htmlTableFromArrayVertical;
module.exports.htmlHeader = htmlHeader;
module.exports.htmlHead = htmlHead;
module.exports.htmlTail = htmlTail;
module.exports.plainIdsFromObjects = plainIdsFromObjects;
module.exports.idsFromIndicatorFormula = idsFromIndicatorFormula;
module.exports.programIndicatorIdsFromIndicatorFormula = programIndicatorIdsFromIndicatorFormula;
module.exports.idsFromFormula = idsFromFormula;
module.exports.programIndicatorIdsFromFormula = programIndicatorIdsFromFormula;
module.exports.arrayRemoveDuplicates = arrayRemoveDuplicates;
module.exports.arrayMerge = arrayMerge;
module.exports.isArray = isArray;
module.exports.arraySortByProperty = arraySortByProperty;
module.exports.arrayFromKeys = arrayFromKeys;

module.exports.sheetFromTable = sheetFromTable;
module.exports.createWorkbook = createWorkbook;
module.exports.appendWorksheet = appendWorksheet;
module.exports.saveWorkbook = saveWorkbook;
module.exports.getLastUpdated = getLastUpdated;

function saveFileJson(fileName, jsonContent) {
	var deferred = Q.defer();

	//sort the json file properties - other content has already been sorted
	jsonContent = jsonSort(jsonContent, {"ignoreCase": true, "reverse": false, "depth": 10});

	//Save file
	var data = jsonFormat(jsonContent);
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
	for (var i = 0; i < objects.length; i++) {
		if (Array.isArray(metaData[objects[i]]) && (objects[i] != "programTrackedEntityAttributes")) {
			switch (objects[i]) {
				case "dataElementGroups":
					metaData[objects[i]] = sortMetaDataArray(metaData[objects[i]]);
					for (let j = 0; j < metaData[objects[i]].length; j++) {
						metaData[objects[i]][j].dataElements = arraySortByProperty(metaData[objects[i]][j].dataElements, "id", false, false);
					}
					break;

				case "indicatorGroups":
					metaData[objects[i]] = sortMetaDataArray(metaData[objects[i]]);
					for (let j = 0; j < metaData[objects[i]].length; j++) {
						metaData[objects[i]][j].indicators = arraySortByProperty(metaData[objects[i]][j].indicators, "id", false, false);
					}
					break;

				case "programIndicatorGroups":
					metaData[objects[i]] = sortMetaDataArray(metaData[objects[i]]);
					for (let j = 0; j < metaData[objects[i]].length; j++) {
						metaData[objects[i]][j].programIndicators = arraySortByProperty(metaData[objects[i]][j].programIndicators, "id", false, false);
					}
					break;

				case "programRuleActions":
					metaData[objects[i]] = arraySortByProperty(metaData[objects[i]], "id", false, false);
					for (let j = 0; j < metaData[objects[i]].length; j++) {
						if (metaData[objects[i]][j].hasOwnProperty("evaluationEnvironments")) {
							metaData[objects[i]][j].evaluationEnvironments = arraySort(metaData[objects[i]][j].evaluationEnvironments, false);
						}
					}
					break;

				case "programRules":
					metaData[objects[i]] = sortMetaDataArray(metaData[objects[i]]);
					for (let j = 0; j < metaData[objects[i]].length; j++) {
						metaData[objects[i]][j].programRuleActions = arraySortByProperty(metaData[objects[i]][j].programRuleActions, "id", false, false);
					}
					break;

				default:
					metaData[objects[i]] = sortMetaDataArray(metaData[objects[i]]);
			}
		}
	}
	
	return metaData;
}


function sortMetaDataArray(toSort) {

	if (toSort.length == 0) return [];

	//Look for name - assume that sort order is not important for "nameable" objects
	if (toSort[0].hasOwnProperty("name")) {
		
		//Sort objects by ID
		if (toSort[0].hasOwnProperty("id")) {
			toSort = arraySortByProperty(toSort, "id", false, false);
		}

	}
	

	//Some special cases:
	//translations
	if (toSort[0].hasOwnProperty("value") && toSort[0].hasOwnProperty("locale") && toSort[0].hasOwnProperty("property")) {
		toSort = sortTranslation(toSort);
	}

	//legends
	if (toSort[0].hasOwnProperty("startValue") && toSort[0].hasOwnProperty("endValue")) {
		toSort = arraySortByProperty(toSort, "startValue", true, false);
	}

	//analyticsPeriodBoundaries in programIndicators
	if (toSort[0].hasOwnProperty("analyticsPeriodBoundaryType")) {
		toSort = arraySortByProperty(toSort, "id", false, false);
	}

	//Check if the objects in the array contains other arrays that should be sorted
	for (var i = 0; i < toSort.length; i++) {
		for (var prop in toSort[i]) {
			if (Array.isArray(toSort[i][prop]) && (prop != "programTrackedEntityAttributes") && (prop != "programStageDataElements") ) {
				toSort[i][prop] = sortMetaDataArray(toSort[i][prop]);
			}
		}
	}

	return toSort;
}



//Use HTML for tables, so ensure support for newlines etc
function htmlTableFromArray(content, header, columnWidths, alignment) {

	if (content.length < 1) {
		console.log("Invalid parameters - need at least one row");
		return "";
	}

	var table = "<table>";
	if (columnWidths) {
		for (var i = 0; i < columnWidths.length; i++) {
			table += "<col width=\"" + columnWidths[i] + "%\">";
		}
	}

	if (header) {
		table += "<tr>";
		for (var i = 0; i < content[0].length; i++) {
			table += "<th>" + content[0][i] + "</th>\n";
		}
		table += "</tr>";
	}

	for (var i = (header ? 1 : 0); i < content.length; i++) {
		table += "<tr>";
		for (var j = 0; j < content[i].length; j++) {
			if (alignment) table += "<td align=\"" + alignment[j] + "\">" + content[i][j] + "</td>";
			else table += "<td>" + content[i][j] + "</td>";
		}
		table += "</tr>";
	}

	table += "</table>";

	return table;
}

//Use HTML for tables, so ensure support for newlines etc
function htmlTableFromArrayVertical(content, columnWidths, alignment) {

	if (content.length < 1) {
		console.log("Invalid parameters - need at least one row");
		return "";
	}

	var table = "<table>";
	if (columnWidths) {
		for (var i = 0; i < columnWidths.length; i++) {
			table += "<col width=\"" + columnWidths[i] + "%\">";
		}
	}

	for (var i = 0; i < content.length; i++) {
		table += "<tr>";

		//First (column) is header
		if (alignment) table += "<th align=\"" + alignment[0] + "\">" + content[i][0] + "</th>";
		else table += "<th>" + content[i][0] + "</th>";

		for (var j = 1; j < content[i].length; j++) {
			if (alignment) table += "<td align=\"" + alignment[j] + "\">" + content[i][j] + "</td>";
			else table += "<td>" + content[i][j] + "</td>";
		}
		table += "</tr>";
	}

	table += "</table>";

	return table;
}

function htmlHeader(text, level, id, cls) {
	var html = "<h";
	html += level;
	if (id) html += " id=\"" + id + "\"";
	if (cls) html += " class=\"" + cls + "\"";
	html += ">" + text + "</h" + level + ">";
	return html;
}


function htmlHead(title) {
	return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"></meta><title>" + title + "</title></head><body>";
}

function htmlTail() {
	return "</body></html>";
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


function programIndicatorIdsFromIndicatorFormula(numeratorFormula, denominatorFormula) {

	var matches = arrayMerge(numeratorFormula.match(/I{\w{11}}/g), denominatorFormula.match(/I{\w{11}}/g));
	if (!matches) return [];

	for (var i = 0; i < matches.length; i++ ) {
		matches[i] = matches[i].slice(2, -1);
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


function programIndicatorIdsFromFormula(formula) {

	var matches = formula.match(/I{\w{11}}/g);
	if (!matches) return [];

	for (var i = 0; i < matches.length; i++ ) {
		matches[i] = matches[i].slice(2, -1);
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
			res = a[property].toLowerCase() < b[property].toLowerCase() ? -1 : 1;
		}
		if (reverse) return -res;
		else return res;
	});

}

function sortTranslation(array) {

	return array.sort(function(a, b) {
		var res;
		if (a.locale == b.locale) {
			if (a.property < b.property) {
				return -1;
			}
			if (a.property > b.property) {
				return 1;
			}
			return 0;

		}
		if (a.locale < b.locale) {
			return -1;
		}
		if (a.locale > b.locale) {
			return 1;
		}
	});
}


function arraySort(array, reverse) {

	return array.sort(function(a, b) {
        if (reverse) return a > b ? -1 : 1;
        else return a < b ? -1 : 1;
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


/*
 * Excel reference generation
 */
function sheetFromTable(aoa, header) {
	var sheet = XLSX.utils.aoa_to_sheet(aoa);
	var range = XLSX.utils.decode_range(sheet["!ref"]);
	let colWidths = [];

	for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
			let cell = sheet[XLSXs.utils.encode_cell({c:C, r:R})];

			if (cell == undefined) {
				console.log('cell is undefined');
				continue;
			}

			if (header && R == 0) {
				cell.s = {font: {bold: true}};
				cell.s.fill = {fgColor: {rgb: "a5a5e2"}};

			} else if (R == 0) {
				cell.s = (cell.s ? cell.s : {});
				cell.s.fill = {fgColor: {rgb: "d5d5f2"}};
			}

			if (R % 2 == 0 && R > 0) {
				cell.s = (cell.s ? cell.s : {});
				cell.s.fill = {fgColor: {rgb: "d5d5f2"}};
			} else if ( R > 0 ) {
				cell.s = (cell.s ? cell.s : {});
                cell.s.fill = {fgColor: {rgb: "e4e4f6"}};
			}
			if (!colWidths[C]) colWidths[C] = 1;
			colWidths[C] = (cell.v.length > colWidths[C]) ? cell.v.length + 2 : colWidths[C];
		}

	}

	sheet["!cols"] = (sheet["!cols"]) ? sheet["!cols"] : [];
	for (let col = 0; col < colWidths.length; col++) {
		sheet["!cols"].push( {wch: colWidths[col]});
	
	}

	return sheet;
}


function createWorkbook() {
	return XLSX.utils.book_new();
}

function appendWorksheet(sheet, book, name) {
	XLSX.utils.book_append_sheet(book, sheet, name);
}

function saveWorkbook(book, file) {
	XLSXs.writeFile(book, file);
	console.log("✔ Reference list saved");
}

function getLastUpdated(metadata) {
    let dates = {}, type, obj;
    for (type in metadata) {
        for (obj of metadata[type]) {
            if (obj.hasOwnProperty('id') && obj.hasOwnProperty('lastUpdated')) {
                dates[obj.id] = Date.parse(obj.lastUpdated + 'Z');
            }
        }
    }

    let latest = new Date(Object.values(dates).reduce((a,b) => {
        return Math.max(a,b);
    }));

    return latest.toISOString().substring(0,19).replace(/[-:]/g, '');
}
