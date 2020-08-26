import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDB, S3 } from "aws-sdk";
import * as uuid from "uuid";

import "source-map-support/register";

type requestParams = {
  brewName: string;
  breweryName: string;
  style: string;
  brewImage: string;
  brewId: string;
};

const dynamoDB = new DynamoDB.DocumentClient();
const s3 = new S3();

const getErrorResponse = (errorMessage: string) => {
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: errorMessage,
    }),
  };
};

const uploadImageToS3 = async (encodedImage, id) => {
  if (!encodedImage || !id) {
    return;
  }
  try {
    const decodedImage: Buffer = Buffer.from(
      encodedImage.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );

    // Getting the file type, ie: jpeg, png or gif
    const type = encodedImage.split(";")[0].split("/")[1];

    const fileName = `brew-images/${id}.${type}`;
    console.log(`About to upload: ${fileName}`);
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: fileName,
      Body: decodedImage,
      ContentEncoding: 'base64',
      ContentType: `image/${type}`
    }
    try {
      await s3.upload(params).promise()
      return `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${fileName}`;
    } catch(err) {
      console.error(err);
      return;
    }

  } catch (err) {
    console.error(err);
    return;
  }
};

export const getBrews: APIGatewayProxyHandler = async (event, _context) => {
  const params = {
    TableName: process.env.DYNAMO_TABLE,
  };

  try {
    const data = await dynamoDB.scan(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.log(err);
    return getErrorResponse(err);
  }
};

export const saveBrew: APIGatewayProxyHandler = async (event, _context) => {
  const requestBody: requestParams = JSON.parse(event.body);
  const { brewName, breweryName, style, brewImage, brewId } = requestBody;
  console.log(
    `Brew Name: ${brewName}, Brewery: ${breweryName}, Style: ${style}`
  );

  const brewImagePath = await uploadImageToS3(brewImage, brewId);

  try {
    const params = {
      TableName: process.env.DYNAMO_TABLE,
      Item: {
        id: uuid.v1(),
        brewName,
        breweryName,
        brewImage: brewImagePath,
        style,
      },
    };
    await dynamoDB.put(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify(params.Item),
    };
  } catch (err) {
    console.error(err);
    return getErrorResponse(err);
  }
};
