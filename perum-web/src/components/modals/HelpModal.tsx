import SchoolSupportModal from '@/components/support/SchoolSupportModal';

interface HelpModalProps {
    onClose: () => void;
}

export default function HelpModal({ onClose }: HelpModalProps) {
    return <SchoolSupportModal onClose={onClose} />;
}
