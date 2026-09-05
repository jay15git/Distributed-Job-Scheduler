const fs = require('fs');
const path = require('path');

const reportsDir = path.join(__dirname, 'reports');
const outputFile = path.join(__dirname, 'PERFORMANCE_REPORT.md');

function generate() {
  let md = '# Performance Report\n\n';
  md += 'This report is generated from K6 benchmark outputs.\n\n';

  if (!fs.existsSync(reportsDir)) {
    console.log('No reports directory found.');
    return;
  }

  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('-summary.json'));
  
  if (files.length === 0) {
    md += '*No benchmark results found. Run K6 tests first to populate this report.*\n';
  }

  for (const file of files) {
    const testName = file.replace('-summary.json', '').toUpperCase();
    const data = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf-8'));
    
    md += `## ${testName} Test\n\n`;
    
    // Extract key metrics
    const reqDuration = data.metrics.http_req_duration;
    const reqFailed = data.metrics.http_req_failed;
    const vus = data.metrics.vus ? data.metrics.vus.values.max : 'N/A';
    
    if (reqDuration) {
      md += `- **P95 Latency**: ${reqDuration.values['p(95)'].toFixed(2)} ms\n`;
      md += `- **Average Latency**: ${reqDuration.values.avg.toFixed(2)} ms\n`;
    }
    
    if (reqFailed) {
      md += `- **Error Rate**: ${(reqFailed.values.rate * 100).toFixed(2)}%\n`;
    }
    
    md += `- **Max VUs**: ${vus}\n`;
    md += '\n';
  }

  fs.writeFileSync(outputFile, md);
  console.log(`Generated ${outputFile}`);
}

generate();
