import { isNil } from 'lodash';
import { EmailProvider } from '@quintessential-sft/email-provider';
import ConduitGrpcSdk from '@quintessential-sft/conduit-grpc-sdk';
import { IRegisterTemplateParams, ISendEmailParams } from '../interfaces';
import { CreateEmailTemplate } from '@quintessential-sft/email-provider/dist/interfaces/CreateEmailTemplate';

export class EmailService {
  private database: any;
  
  constructor(private emailer: EmailProvider, private readonly grpcSdk: ConduitGrpcSdk) {
    const self = this;
    this.grpcSdk.waitForExistence('database-provider').then((r) => {
      self.database = self.grpcSdk.databaseProvider;
    });
  }
  
  updateProvider(emailer: EmailProvider) {
    this.emailer = emailer;
  }
  
  getExternalTemplates() {
    return this.emailer._transport?.listTemplates();
  }

  createExternalTemplate(data: CreateEmailTemplate){
    return this.emailer._transport?.createTemplate(data);
  }

  async  registerTemplate(params: IRegisterTemplateParams) {
    
    const { name, body, subject, variables } = params;
    
    const existing = await this.database.findOne('EmailTemplate', { name });
    if (!isNil(existing)) return existing;
    
    return this.database.create('EmailTemplate', {
      name,
      subject,
      body,
      variables,
    });
  }

  
  async sendEmail(template: string, params: ISendEmailParams) {
    const { email, body, subject, variables, sender } = params;
    
    const builder = this.emailer.emailBuilder();
    
    if (!template && (!body || !subject)) {
      throw new Error(`Template/body+subject not provided`);
    }
    
    let templateFound;
    if (template) {
      templateFound = await this.database.findOne('EmailTemplate', { name: template });
      if (isNil(templateFound)) {
        throw new Error(`Template ${template} not found`);
      }
    }

    if(!isNil(sender)){
      builder.setSender(sender);
    }
    else if(!isNil(templateFound.sender) && isNil(sender) ){
      builder.setSender(templateFound.sender);
    }
    else{
      throw new Error(`Sender must be provided!`);
    }

    if(templateFound.externalManaged){
      builder.setTemplate({
        id: templateFound.id,
        variables: variables as any,
      })
    }
    else{
      const bodyString = templateFound
      ? this.replaceVars(templateFound.body, variables)
      : body!;
    }
    
    const subjectString = templateFound
    ? this.replaceVars(templateFound.subject, variables)
    : subject!;
    builder.setSubject(subjectString);
    builder.setReceiver(email);

    if (params.cc) {
      builder.setCC(params.cc);
    }
    
    if (params.replyTo) {
      builder.setReplyTo(params.replyTo);
    }
    
    if (params.attachments) {
      builder.addAttachments(params.attachments as any);
    }
    return this.emailer.sendEmail(builder);
  }
  
  private replaceVars(body: string, variables: { [key: string]: any }) {
    let str = body;
    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      let value = variables[key];
      if (Array.isArray(value)) {
        value = value.toString();
      } else if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      str = str.replace(regex, value);
    });
    return str;
  }
}
