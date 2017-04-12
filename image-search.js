/* 
Image Search Abstraction Layer
Raymond Rizzo
*/

var express = require('express');
var app = express();
var fs = require('fs');
var request = require('request');
var mongo = require('mongodb').MongoClient;
var mongoURL = process.env.MONGOLAB_URI;
var msApi = process.env.BING_API;
var lastSearchTags;
var lastSearchResults = [[]];

app.get('/about/', function(httpRequest, httpResponse){
	httpResponse.sendFile(__dirname + '/about.html');
});

app.get('/latestsearches', function(httpRequest, httpResponse){
	var date = new Date();
	var priorMonth = new Date();
	priorMonth.setMonth(priorMonth.getMonth() - 1);
	mongo.connect(mongoURL , function(error, database){
		if(error){
			throw error;
		} else {
			database.collection('image-searches').find({ when: { $gt: priorMonth ,$lt: date } }, { _id: 0 }).toArray(function(error, documents){
				if(error){
					throw error;
				} else {
					httpResponse.writeHead(200, { "Content-Type": "application/json" });
					httpResponse.end(JSON.stringify(documents));
				}
			});
		}
	});
});

app.get('/imagesearch', function(httpRequest, httpResponse){
	var queryTags = httpRequest.query.tags.replace(/\s/g,'%20');
	var queryOffset = httpRequest.query.offset;
	console.log('initial queryOffset: ' + queryOffset);
	// Log the search.
	logSearch(httpRequest.query.tags);
	
	// Check to see if this is a new search, or the same search re-ran.
	if(queryTags === lastSearchTags && lastSearchResults){
			console.log('Duplicate Search');
			// Bounary check the offset.
			if(queryOffset === 0){
				queryOffset = 1;
			} else if(queryOffset >= lastSearchResults.length){
				queryOffset = lastSearchResults.length-2;
			}
			// Display results.
			console.log('queryOffset: ' + queryOffset);
			console.log(lastSearchResults[queryOffset][0]);
			httpResponse.writeHead(200, { "Content-Type": "application/json" });
			httpResponse.end(JSON.stringify(lastSearchResults[queryOffset]));
		} else {
			console.log('New Search');
			lastSearchTags = queryTags;
			searchBing(queryTags, function(searchResults){
				// Split the results into a 3D array for pagination.
				var documentCounter = 0;
				var pageCounter = 0;
				while(documentCounter < searchResults.value.length){
					var entryCounter = 0;
					while(entryCounter < 10 && documentCounter < searchResults.value.length){
						lastSearchResults[pageCounter].push(searchResults.value[documentCounter]);
						if(entryCounter === 9){
							lastSearchResults.push([]);
						}
						documentCounter++;
						entryCounter++
					}
				pageCounter++;
				}
				// Bounary check the offset.
				if(queryOffset === 0){
					queryOffset = 1;
				} else if(queryOffset >= lastSearchResults.length){
					queryOffset = lastSearchResults.length-2;
				}
				// Display results.
				console.log('queryOffset: ' + queryOffset);
				console.log(lastSearchResults[queryOffset][0]);
				httpResponse.writeHead(200, { "Content-Type": "application/json" });
				httpResponse.end(JSON.stringify(lastSearchResults[queryOffset]));
			});
		}	
});

app.get('/*', function(httpRequest, httpResponse){
	// Handle improper input.
	var errorObject = { 'error': 'Invalid input, for more information see https://image-search-zombat.herokuapp.com/about', 'received': httpRequest.url.substring(5, httpRequest.originalUrl.length)};
		httpResponse.writeHead(200, { "Content-Type": "application/json" });
		httpResponse.end(JSON.stringify(errorObject));
});
// Search Bing Image search.
function searchBing(queryTags, callback) {
	var searchUrl = 'https://api.cognitive.microsoft.com/bing/v5.0/images/search?q=' + queryTags + '&count=' + 100 + '&offset=0&mkt=en-us&safeSearch=Moderate';
	request.get({
		url: searchUrl,
		json: true,
		headers: {'User-Agent': 'request',
		'Ocp-Apim-Subscription-Key': msApi }
	}, function (error, response, searchData) {
			if (error) {
				console.log(error);
			} else if (response.statusCode !== 200) {
				console.log('Status:', response.statusCode);
			} else {
				callback(searchData);
				return searchData;
			}
		});
};

// Log the search to the database.
function logSearch(searchTags){
	var date = new Date();
	var newDocument = {
		'term': searchTags,
		'when': date
	};
	mongo.connect(mongoURL , function(error, database){
		if(error){
			throw error;
		} else {
			database.collection('image-searches').insert(newDocument, function(error, data){
				if(error){
					throw error;
				} else {
					console.log(JSON.stringify(newDocument));
					database.close();
				}
			});
		}
	});
}


app.listen(process.env.PORT);