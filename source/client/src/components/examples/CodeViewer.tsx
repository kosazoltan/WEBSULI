import CodeViewer from '../CodeViewer'

const sampleHTML = `<!DOCTYPE html>
<html>
<head>
  <title>Professzionális bemutató</title>
  <style>
    body {
      font-family: Arial;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
    }
    h1 { font-size: 48px; }
  </style>
</head>
<body>
  <h1>Professzionális HTML Anyag</h1>
  <p>Ez egy példa HTML fájl profiknak.</p>
</body>
</html>`;

export default function CodeViewerExample() {
  return (
    <CodeViewer
      title="Professzionális bemutató"
      materialId="example-material-id"
      onBack={() => console.log('Back clicked')}
    />
  )
}
