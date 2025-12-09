import FileCard from '../FileCard'

export default function FileCardExample() {
  return (
    <div className="max-w-sm">
      <FileCard
        id="1"
        title="Első HTML oldalunk"
        description="Egyszerű HTML oldal címsorral, bekezdéssel és színes háttérrel."
        createdAt={new Date()}
        onView={() => console.log('View clicked')}
        onDelete={() => console.log('Delete clicked')}
      />
    </div>
  )
}
