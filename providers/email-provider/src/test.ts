import { EmailProvider } from "./index"
import { CreateSendgridTemplate } from "./interfaces/sendgrid/CreateSendgridTemplate";
// let provider = new EmailProvider('mailgun',{
//     mailgun:{
//         proxy:null,
//         host: 'api.mailgun.net',
//         domain:'***REMOVED***',
//         apiKey: '***REMOVED***'
//     }
// });

let provider = new EmailProvider('sendgrid',{
    apiKey: '***REMOVED***'
});

// let provider = new EmailProvider('mandrill',{
//     mandrill : { 
//         apiKey: '***REMOVED***'
//     }
// });

// let mailOptions: MandrillEmailOptions = {
//     to: [{ 
//         address: "dimitrissoldatos2@md.quintessential.gr",
//         name: "dim"
//     }],
//     mandrillOptions:{
//             template_name: 'first-template',
//             template_content: [],
//             message: {
//                 merge: true,
//                 merge_language: "handlebars",
//                 global_merge_vars: [{
//                     name: "fname",
//                     content: "John"
//                 },
//             ]
//         }
//     }
// };
// let mail = provider.emailBuilder()
//             .setReceiver("dimitris.soldatos@quintessential.gr")
//             .setSubject('Hello ✔')           
//             .setSender("dimitris.soldatos@quintessential.gr")
//             .setContent("AFSAasfasfasfaFAS");

//           provider
//           .sendEmail(mail)
//           ?.then( (r) => {
//               console.log('Email sent!');
//           }) 
//           .catch( (err) => {
//               console.log('err',err);
//           });

const data: CreateSendgridTemplate =  {
    name: " my templatessssasfasfagsdfgdfgdgdfsssss",
    generation:'dynamic',
    version: {
        subject: 'xaxaasdasxa',
        name: 'first vesasrsion',
        html_content:' <p> gia afasfas psixoula m </p>'
    }
}

// var mailgundata = {
//     name : "psixoula",
//     description: "psixoula description",
//     template: "<p>na to to template psixoula m</p>",
//     engine: "handlebars"
// };
provider._transport?.createTemplate(data).then((body:any)  => {
    console.log(body);
})
.catch(err => {
    console.log(err);
})

// provider._transport?.getTemplateInfo('ffff').then(res =>{
    //     console.log(res);
    // })
    // .catch(err => {
        //     console.log(err);
        // });
        //     console.log(body);
// })
// .catch( (err:any) => {
//     console.log(err);
// });
//sendgrid api key ***REMOVED***