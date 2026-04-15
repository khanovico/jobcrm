import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Modal, ModalProps } from "./Modal";

type MarkdownModalProps = Pick<ModalProps, "open" | "onClose" | "title" | "size"> & {
  markdown: string;
};

/**
 * Floating modal that renders GitHub-flavored Markdown with readable typography.
 */
export const MarkdownModal = ({ open, onClose, title, markdown, size = "3xl" }: MarkdownModalProps) => (
  <Modal open={open} onClose={onClose} title={title} size={size} bodyClassName="w-11/12">
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:scroll-mt-4 prose-a:break-words prose-pre:bg-base-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  </Modal>
);
