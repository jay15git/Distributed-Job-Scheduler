import SwaggerParser from 'swagger-parser';
import path from 'path';

async function validateOpenApi() {
  const specPath = path.resolve(__dirname, '../../../docs/api/openapi.yaml');
  try {
    const parser = SwaggerParser as any;
    const api = await parser.validate(specPath);
    console.log(`✅ OpenAPI specification is valid: ${api.info.title} v${api.info.version}`);
  } catch (err: any) {
    console.error('❌ OpenAPI specification is invalid:');
    console.error(err.message);
    process.exit(1);
  }
}

validateOpenApi();
