const express = require("express");
const app = express();
const bodyParser = require('body-parser')
require('dotenv').config()
const strings = require("/app/utils/strings.json");
const { CloudantV1 } = require('@ibm-cloud/cloudant');
const { BasicAuthenticator } = require('ibm-cloud-sdk-core');
const uuid = require('uuid');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

let NLU_APIKEY, NLU_URL, CLOUDANT_URL, CLOUDANT_API;
let moviesDb, naturalLanguageUnderstanding, cloudant;
const dbName = 'movies-reviews';
let service;

//load from local .env file
console.log('local env file found')
NLU_APIKEY = process.env.NLU_APIKEY;
NLU_URL = process.env.NLU_URL;
CLOUDANT_URL = process.env.CLOUDANT_URL;
CLOUDANT_USERNAME = process.env.CLOUDANT_USERNAME;
CLOUDANT_PASSWORD = process.env.CLOUDANT_PASSWORD;


function initDB() {
  const authenticator = new BasicAuthenticator({
      username: process.env.CLOUDANT_USERNAME,
      password: process.env.CLOUDANT_PASSWORD
  });

    service = new CloudantV1({
    authenticator: authenticator
});

service.setServiceUrl(process.env.CLOUDANT_URL);
}

if (CLOUDANT_USERNAME && CLOUDANT_PASSWORD && CLOUDANT_URL) {
  initDB();
  // Create a new "moviesDb" database.

  service.getAllDbs().then(response => {
    if(!response.result.includes(dbName)) {
      console.log(dbName+" doesn't exist. Creating it.");
    service.putDatabase({
        db: dbName,
        partitioned: true
      }).then(response => {
        console.log(response.result);
      });    
    }
  });
} 

if (NLU_APIKEY && NLU_URL) {
  const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1');
  const { IamAuthenticator } = require('ibm-watson/auth');

  naturalLanguageUnderstanding = new NaturalLanguageUnderstandingV1({
    version: '2020-08-01',
    authenticator: new IamAuthenticator({
      apikey: NLU_APIKEY,
    }),
    serviceUrl: NLU_URL,
  });
}

// user asked for the index page
app.get('/', function (req, res, next) {
  // show error if nlu or cloudant credentials are not present
  errors = checkServiceCredentials();
  if (errors && errors.length > 0) {
    res.render('index.ejs', { msg: { errors: errors } });
  } else {
    res.render('index.ejs', { msg: {} });
  }
});

// user is on the reviews page
app.get("/reviews", function (request, response) {
  // get all the cloudant data and display the result
  let errors = checkServiceCredentials();
  if (errors && errors.length > 0) {
    response.render('reviews.ejs', { msg: { errors: errors } })
  } else {
    service.postAllDocs({
      db: dbName,
      includeDocs: true,
      limit: 10
    }).then(res => {
        response.render('reviews.ejs', { msg: { result: res.result.rows } });
    }).catch((err)=>{
      response.render('reviews.ejs', { msg: { errors: [strings.CLOUDANT_ERROR + " " + err.message] } })
    });
  }
});

// user posted a review
app.post("/reviews", function (request, response) {

  let errors = checkServiceCredentials();

  let firstName = request.body.first_name;
  let lastName = request.body.last_name;
  let review = request.body.review;
  let movie = request.body.movie;

  if (!firstName || !lastName || !review || !movie) {
    errors.push(strings.INVALID_FORM);
  }

  if (errors && errors.length > 0) {
    response.render('reviews.ejs', { msg: { errors: errors } })
  } else {

    let doc = {
      "firstName": firstName,
      "lastName": lastName,
      "movie": movie,
      "review": review
    };

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
        doc['_id'] = uuid.v4()+":1",
        service.postDocument({
          db: dbName,
          document: doc
        }).then(response => {
          console.log(response.result);
        });
        response.redirect('/reviews');
      })
      .catch(err => {
        console.log('error:', err);
        response.render('reviews.ejs', { msg: { errors: [strings.NLU_NOT_ENOUGH_TEXT] } })
      });
  }
});

function checkServiceCredentials() {
  let errors = [];
    if (!service) {
      errors.push(strings.CLOUDANT_PROBLEM);
    }

    if (!naturalLanguageUnderstanding) {
      errors.push(strings.NLU_PROBLEM);
    }
  return errors;
}

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(express.static(__dirname + '/views'));

let port = process.env.PORT || 8080
app.listen(port, function () {
  console.log("To view your app, open this link in your browser: http://localhost:" + port);
});
