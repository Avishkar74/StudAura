import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'

/** "Upload Notes" is not built yet (PRD 6.12): no file input, no storage, no upload call. */
export function UploadNotesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Upload notes" description="Coming soon" onClose={onClose}>
      <p className="text-sm text-text-secondary">
        You&apos;ll be able to attach handwritten notes and documents to this video. For now, create
        notes directly here.
      </p>
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Got it</Button>
      </div>
    </Modal>
  )
}
