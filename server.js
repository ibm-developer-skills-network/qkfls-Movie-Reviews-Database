var express = require("express");
var app = express();
var bodyParser = require('body-parser')
require('dotenv').config()

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

let moviesDb, cloudant, naturalLanguageUnderstanding;
const isNLUAvailable = process.env.NLU_APIKEY && process.env.NLU_URL;
const isCloudantAvaliable = process.env.CLOUDANT_URL;
const dbName = 'movies-reviews';

if (isCloudantAvaliable) {
  var Cloudant = require('@cloudant/cloudant');
  // use IAM here
  cloudant = Cloudant({ url: process.env.CLOUDANT_URL, plugins: { iamauth: { iamApiKey: process.env.CLOUDANT_API} } });
}

if (isNLUAvailable) {
  const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1');
  const { IamAuthenticator } = require('ibm-watson/auth');

  naturalLanguageUnderstanding = new NaturalLanguageUnderstandingV1({
    version: '2020-08-01',
    authenticator: new IamAuthenticator({
      apikey: process.env.NLU_APIKEY,
    }),
    serviceUrl: process.env.NLU_URL,
  });
}

app.post("/reviews", function (request, response) {
  var firstName = request.body.first_name;
  var lastName = request.body.last_name;
  var review = request.body.review;
  var movie = request.body.movie;

  var doc = {
    "firstName": firstName,
    "lastName": lastName,
    "movie": movie,
    "review": review
  };
  if (!moviesDb) {
    console.log("No database.");
    response.send(doc);
    return;
  }

  const analyzeParams = {
    'text': review,
    'features': {
      'sentiment': {
      }
    },
  };

  naturalLanguageUnderstanding.analyze(analyzeParams)
    .then(analysisResults => {
      console.log(JSON.stringify(analysisResults, null, 2));
      doc['sentiment'] = analysisResults.result.sentiment.document.label;
      moviesDb.insert(doc, function (err, body, header) {
        if (err) {
          console.log('[moviesDb.insert] ', err.message);
          return;
        }
        doc._id = body.id;
        response.redirect('/reviews');
      });
    })
    .catch(err => {
      console.log('error:', err);
    });
});

app.get("/reviews", function (request, response) {
  // get all the cloudant data and display the result
  var reviews = [];
  moviesDb.list({ include_docs: true }, function (err, body) {
    response.render('reviews.html', { result: body.rows });
  });
});

if (cloudant) {

  // Create a new "moviesDb" database.
  cloudant.db.create(dbName, function (err, data) {
    if (!err) //err if database doesn't already exists
      console.log("Created database: " + dbName);
  });

  // Specify the database we are going to use (moviesDb)...
  moviesDb = cloudant.db.use(dbName);

  vendor = 'cloudant';
} else {
  console.log('cloudant NOT FOUND');
}

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(express.static(__dirname + '/views'));

var port = process.env.PORT || 8080
app.listen(port, function () {
  console.log("To view your app, open this link in your browser: http://localhost:" + port);
});
