const express = require("express");
const https = require("https");
const qs = require("querystring");
const checksum_lib = require("./Paytm/checksum");
const config = require("./Paytm/config");
const PDFDocument=require('pdfkit');
const path=require('path');
const fs=require('fs');
const nodemailer = require('nodemailer');
const { google } = require('googleapis')
const sendgridTransport = require('nodemailer-sendgrid-transport');

const CLIENT_ID = '107657521905-llgb3673cmoiucqs2rfspql64qnp4f3a.apps.googleusercontent.com';
const CLIENT_SECRET = 'fS4frNpb4r9Cu580IRgknaJA';
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';
const REFRESH_TOKEN = '1//045mXM6rbXHnVCgYIARAAGAQSNwF-L9Ir1aLTH2CwmZYQb4626ctvh_AG_9FvAUd563UO4aHTwdVWM7r_HfLFRdtsuMccm9E7WAA';

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET,REDIRECT_URI)
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN })

// const transporter = nodemailer.createTransport(sendgridTransport({
//   auth: {

    
//   }
// }));

var invoice;
var custid;
var email;
const app = express();
const parseUrl = express.urlencoded({ extended: false });
const parseJson = express.json({ extended: false });
app.use(express.static(__dirname + '/public'));

const PORT = process.env.PORT || 4000;

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/introduction.html");
});
app.post('/start', (req, res) => {
  res.sendFile(__dirname + "/first.html");
});
app.post('/payment', (req, res) => {
  res.sendFile(__dirname + "/index.html");
})
app.get('/invoice',(req,res,next)=>{
 

  const invoiceName = 'invoice-' + custid+ '.pdf';
  const invoicePath = path.join('data', 'invoices', invoiceName);
  const pdfDoc= new PDFDocument({ margin: 50 });
res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="' + invoiceName + '"'
        );
pdfDoc.pipe(fs.createWriteStream(invoicePath));
pdfDoc.pipe(res);

pdfDoc.fontSize(25).text('Invoice',{
  underline:true,
  align:'center'
});
pdfDoc.text('--------------------',{
  align:'center'
}); 
pdfDoc
    .fontSize(20)
    .text(
      "Congratulations!!",
 
      { align: "center",margin:50}
    );
    pdfDoc
    .fontSize(15)
    .text(
      " Your payment is successful",
 
      { align: "center",margin:50}
    );
   
   
pdfDoc.fontSize(20).text(' Your total amount is :Rs.'+invoice,{
  align:'center',
  margin: 50 
});
pdfDoc.text('--------------------',{
  align:'center'
}); 
pdfDoc
.fontSize(10)
.text(
  "Thank You",
  { align: "center" ,
  margin: 50 }
);
pdfDoc.end();
     

});
app.post("/paynow", [parseUrl, parseJson], (req, res) => {
  // Route for making payment

  var paymentDetails = {
    amount: req.body.amount,
    customerId: req.body.name,
    customerEmail: req.body.email,
    customerPhone: req.body.phone
  }
  invoice=paymentDetails.amount;
  custid=paymentDetails.customerId;
  email=paymentDetails.customerEmail;
 console.log(paymentDetails.amount);

  if (!paymentDetails.amount || !paymentDetails.customerId || !paymentDetails.customerEmail || !paymentDetails.customerPhone) {
    res.status(400).sendFile(__dirname + "/fail.html");
  } else {
    var params = {};
    params['MID'] = config.PaytmConfig.mid;
    params['WEBSITE'] = config.PaytmConfig.website;
    params['CHANNEL_ID'] = 'WEB';
    params['INDUSTRY_TYPE_ID'] = 'Retail';
    params['ORDER_ID'] = 'TEST_' + new Date().getTime();
    params['CUST_ID'] = paymentDetails.customerId;
    params['TXN_AMOUNT'] = paymentDetails.amount;
    params['CALLBACK_URL'] = 'http://localhost:4000/callback';
    params['EMAIL'] = paymentDetails.customerEmail;
    params['MOBILE_NO'] = paymentDetails.customerPhone;


    checksum_lib.genchecksum(params, config.PaytmConfig.key, function (err, checksum) {
      // var txn_url = "https://securegw-stage.paytm.in/theia/processTransaction"; // for staging
      // var txn_url = "https://securegw.paytm.in/theia/processTransaction"; // for production
      var txn_url = "https://securegw-stage.paytm.in/order/process"; // for staging
      var form_fields = "";
      for (var x in params) {
        form_fields += "<input type='hidden' name='" + x + "' value='" + params[x] + "' >";
      }
      form_fields += "<input type='hidden' name='CHECKSUMHASH' value='" + checksum + "' >";

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<html><head><title>Merchant Checkout Page</title></head><body><center><h1>Please do not refresh this page...</h1></center><form method="post" action="' + txn_url + '" name="f1">' + form_fields + '</form><script type="text/javascript">document.f1.submit();</script></body></html>');
      res.end();
    });
  }
});

app.post("/callback", (req, res) => {
  // Route for verifiying payment

  var body = '';

  req.on('data', function (data) {
    body += data;
  });

  req.on('end', function () {
    var html = "";
    var post_data = qs.parse(body);

    // received params in callback
    console.log('Callback Response: ', post_data, "\n");


    // verify the checksum
    var checksumhash = post_data.CHECKSUMHASH;
    // delete post_data.CHECKSUMHASH;
    var result = checksum_lib.verifychecksum(post_data, config.PaytmConfig.key, checksumhash);
    console.log("Checksum Result => ", result, "\n");


    // Send Server-to-Server request to verify Order Status
    var params = { "MID": config.PaytmConfig.mid, "ORDERID": post_data.ORDERID };

    checksum_lib.genchecksum(params, config.PaytmConfig.key, function (err, checksum) {

      params.CHECKSUMHASH = checksum;
      post_data = 'JsonData=' + JSON.stringify(params);

      var options = {
        hostname: 'securegw-stage.paytm.in', // for staging
        // hostname: 'securegw.paytm.in', // for production
        port: 443,
        path: '/merchant-status/getTxnStatus',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': post_data.length
        }
      };


async function sendMail() {
        try {
            const accessToken = await oAuth2Client.getAccessToken()

            const transport = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: 'saumyakumari6715@gmail.com',
                    clientId: CLIENT_ID,
                    clientSecret: CLIENT_SECRET,
                    refreshToken: REFRESH_TOKEN,
                    accessToken: accessToken
                }
            })
            const mailOptions = {
              from: 'MAGAZINES ONLY <saumyakumari6715@gmail.com>',
              to: email,
              subject: "Thank You for subscribing Magazines Only",
              html: '<h1>Magazines Only Looks forward to provide you the best services.</h1><p><a href="http://localhost:4000/invoice"> click here </a> to get the invoice',
          };


          const result = await transport.sendMail(mailOptions)
          return result

      } catch (error) {
              return error
      }
  }




      // Set up the request
      var response = "";
      var post_req = https.request(options, function (post_res) {
        post_res.on('data', function (chunk) {
          response += chunk;
        });

        post_res.on('end', function () {
          console.log('S2S Response: ', response, "\n");

          var _result = JSON.parse(response);
          if (_result.STATUS == 'TXN_SUCCESS') {
            res.sendFile(__dirname + "/success.html");
            return sendMail().then(result => console.log('Email is sent.....', result))
            .catch(error => console.log(error.message));
          } else {
            res.sendFile(__dirname + "/fail.html");
          }
        });
      });

      // post the data
      post_req.write(post_data);
      post_req.end();
    });
  });
});

app.listen(PORT, () => {
  console.log(`App is listening on Port ${PORT}`);
});