const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');

console.log('Generating OpenAPI types from localhost:3000...');

const fetchSchema = () => {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/openapi.json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          fs.writeFileSync('schema.json', data);
          resolve();
        } else {
          reject(new Error(`Failed to fetch schema: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
};

fetchSchema()
  .then(() => {
    console.log('Schema saved to schema.json. Generating TS types...');
    execSync('npx openapi-typescript schema.json -o src/types/api.ts', { stdio: 'inherit' });
    fs.unlinkSync('schema.json');
    console.log('Successfully generated src/types/api.ts');
  })
  .catch(err => {
    console.error('Error generating types. Is the backend running on port 3000?');
    console.error(err.message);
    process.exit(1);
  });
