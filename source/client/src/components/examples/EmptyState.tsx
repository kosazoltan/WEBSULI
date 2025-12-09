import EmptyState from '../EmptyState'

export default function EmptyStateExample() {
  return <EmptyState onUploadClick={() => console.log('Upload clicked')} />
}
