import UploadZone from '../UploadZone'

export default function UploadZoneExample() {
  return (
    <UploadZone
      onUpload={(file) => console.log('Uploaded:', file)}
      onCancel={() => console.log('Cancelled')}
    />
  )
}
