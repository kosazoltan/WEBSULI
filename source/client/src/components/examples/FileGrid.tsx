import FileGrid from '../FileGrid'
import { type HtmlFile } from '@shared/schema'

const mockFiles: HtmlFile[] = [
  {
    id: '1',
    title: 'Első HTML oldalunk',
    description: 'Egyszerű HTML oldal címsorral, bekezdéssel és színes háttérrel.',
    content: '<html><body><h1>Hello</h1></body></html>',
    createdAt: new Date('2025-01-15'),
  },
  {
    id: '2',
    title: 'Linkek gyakorlása',
    description: 'Megtanuljuk használni az <a> taget különböző linkekkel.',
    content: '<html><body><a href="#">Link</a></body></html>',
    createdAt: new Date('2025-01-18'),
  },
  {
    id: '3',
    title: 'Képek beillesztése',
    description: 'Képek hozzáadása az oldalunkhoz az <img> taggel.',
    content: '<html><body><img src="pic.jpg" /></body></html>',
    createdAt: new Date('2025-01-20'),
  },
]

export default function FileGridExample() {
  return (
    <div className="p-4">
      <FileGrid
        files={mockFiles}
        onView={(file) => console.log('View:', file.title)}
        onDelete={(id) => console.log('Delete:', id)}
      />
    </div>
  )
}
