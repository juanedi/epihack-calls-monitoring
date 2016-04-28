var FeedParser = require('feedparser')
  , request = require('request');

var req = request('http://verboice.instedd.org/feeds/f5e57352-58b0-8c72-56e9-fa3e87c0063f/recordings.rss')
  , feedparser = new FeedParser();

var fs = require("fs");

var elasticsearch = require('elasticsearch');
var es = new elasticsearch.Client({host: '52.201.204.236:9200'});

fs.readFile("seen.txt", 'utf8', function(err, data) {
  seenCalls = data.split("\n")

  req.on('error', function (error) {
    // handle any request errors
  });
  req.on('response', function (res) {
    var stream = this;
    if (res.statusCode != 200) return this.emit('error', new Error('Bad status code'));
    stream.pipe(feedparser);
  });
  feedparser.on('error', function(error) {
    // always handle errors
  });
  feedparser.on('readable', function() {
    var stream = this
    , meta = this.meta
    , item;

    while (item = stream.read()) {
      if (seenCalls.indexOf(item.title) < 0) {
        processItem(item);
      }
    }
  });

  // fs.createReadStream("./recordings.rss")
  // .on('error', function (error) {
  //   console.error(error);
  // })
  // .pipe(new FeedParser())
  // .on('error', function (error) {
  //   console.error(error);
  // })
  // .on('readable', function() {
  //   var stream = this, item;
  //   while (item = stream.read()) {
  //     if (seenCalls.indexOf(item.title) < 0) {
  //       processItem(item);
  //     }
  //   }
  // });

  function processItem(item) {
   var event = {
      flags: [ ],
      audio: item.link,
      on_set_date: isoFormat(item.pubDate),
      created_at: new Date().toISOString()
    };

    var callId = item.description.split(",")[0].split(": ")[1];

    request(`http://verboice.instedd.org/calls/${callId}/download_details.csv`, {
      'auth': {
        'user': 'jedi@manas.com.ar',
        'pass': undefined, // FILL
        'sendImmediately': true
      }
    }, function(error, response, csv) {
      var phone = phoneNumber(csv);
      
      if(phone) {
        event.phone_number = phone;
        es.index({index: 'epihack', type: 'volunteer_event', body: event})
          .then(function() {
            console.log(JSON.stringify(event, 2, null));
            fs.appendFile("seen.txt", item.title + "\n");
          })
      }
    })

  }

  function phoneNumber(callDetail) {
    var regexp = /CALLER_ID = \'(.*)\'/g;
    var match = regexp.exec(callDetail);
    if (match) {
      var str = match[1];
      if (!isNaN(parseInt(str))) {
        return str;
      }
    }

    return match && !isNaN(match[1]) && match[1];
  }

  function isoFormat(dateStr) {
    var timestamp = Date.parse(dateStr);
    return new Date(timestamp).toISOString();
  }

});

