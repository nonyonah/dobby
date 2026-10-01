import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
  BankIcon,
  BarChartIcon,
  BellIcon as BellGlyph,
  BookmarkIcon as BookmarkGlyph,
  BriefcaseIcon as BriefcaseGlyph,
  Calendar03Icon,
  CancelIcon,
  ChartLineIcon,
  Checkmark,
  CheckmarkCircle01Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleQuestionMarkIcon,
  CreditCardIcon,
  Dollar01Icon,
  DollarCircleIcon,
  Exchange01Icon,
  FileTextIcon,
  Folder01Icon,
  FunnelIcon,
  GridViewIcon,
  MailIcon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  PlusIcon as PlusGlyph,
  ReceiptIcon as ReceiptGlyph,
  SearchIcon as SearchGlyph,
  SettingsIcon as SettingsGlyph,
  Tag01Icon,
  Target01Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  Upload01Icon,
  WalletIcon as WalletGlyph,
} from "@hugeicons/core-free-icons"

// Rift Labs iconography on Hugeicons: a single 24px grid at a 1.5 stroke
// across the app, 2 for the heavier navigation and selected states. Colour
// comes from currentColor via the caller's class.

interface IconProps {
  className?: string
}

/**
 * `heavy` is the old Phosphor `weight="fill"`: Hugeicons has no filled set,
 * so the heavy end of its stroke range stands in for it.
 */
function P({
  icon,
  size,
  heavy = false,
  className,
}: IconProps & { icon: unknown; size: number; heavy?: boolean }) {
  return <HugeiconsIcon icon={icon as never} size={size} strokeWidth={heavy ? 2 : 1.5} className={className} />
}

// ——— Sidebar navigation (filled) ———

export function DashboardIconFull({ className }: IconProps) {
  return <P icon={GridViewIcon} size={16} heavy className={className} />
}

export function AccountsIcon({ className }: IconProps) {
  return <P icon={BankIcon} size={16} heavy className={className} />
}

export function TransactionsIcon({ className }: IconProps) {
  return <P icon={Exchange01Icon} size={16} heavy className={className} />
}

export function ReportsIcon({ className }: IconProps) {
  return <P icon={BarChartIcon} size={16} heavy className={className} />
}

export function InsightsIcon({ className }: IconProps) {
  return <P icon={BarChartIcon} size={14} heavy className={className} />
}

export function BudgetIcon({ className }: IconProps) {
  return <P icon={WalletGlyph} size={16} heavy className={className} />
}

export function GoalsIcon({ className }: IconProps) {
  return <P icon={Target01Icon} size={16} heavy className={className} />
}

export function SettingsIcon({ className }: IconProps) {
  return <P icon={SettingsGlyph} size={16} heavy className={className} />
}

// ——— Product UI (regular, soft currentColor tones) ———

export function TrendUpIcon({ className }: IconProps) {
  return <P icon={TrendingUpIcon} size={12} className={className} />
}

export function TrendDownIcon({ className }: IconProps) {
  return <P icon={TrendingDownIcon} size={12} className={className} />
}

export function CaretDownIcon({ className }: IconProps) {
  return <P icon={ChevronDownIcon} size={12} className={className} />
}

export function FilledChevronDownIcon({ className }: IconProps) {
  return <P icon={ChevronDownIcon} size={12} heavy className={className} />
}

export function CaretUpDownIcon({ className }: IconProps) {
  return <P icon={ArrowUpDownIcon} size={14} className={className} />
}

/** ` heavy` gives the solid mark; the default stays the outline glyph. */
export function CheckIcon({ className, weight }: IconProps & { weight?: "regular" | "bold" | "fill" }) {
  return <P icon={Checkmark} size={12} heavy={weight !== undefined && weight !== "regular"} className={className} />
}

/** ` heavy` gives the solid disc; the default stays the outline glyph. */
export function CheckCircleIcon({ className, weight }: IconProps & { weight?: "regular" | "bold" | "fill" }) {
  return <P icon={CheckmarkCircle01Icon} size={20} heavy={weight !== undefined && weight !== "regular"} className={className} />
}

export function CloseIcon({ className }: IconProps) {
  return <P icon={CancelIcon} size={14} className={className} />
}

export function CloseSmallIcon({ className }: IconProps) {
  return <P icon={CancelIcon} size={12} className={className} />
}

export function UploadIcon({ className }: IconProps) {
  return <P icon={Upload01Icon} size={14} className={className} />
}

export function SearchIcon({ className }: IconProps) {
  return <P icon={SearchGlyph} size={14} className={className} />
}

export function PlusIcon({ className }: IconProps) {
  return <P icon={PlusGlyph} size={14} className={className} />
}

export function BellIcon({ className, filled = false }: IconProps & { filled?: boolean }) {
  return <P icon={BellGlyph} size={16} heavy={filled} className={className} />
}

export function FilterIcon({ className }: IconProps) {
  return <P icon={FunnelIcon} size={14} className={className} />
}

export function SortUpIcon({ className }: IconProps) {
  return <P icon={ArrowUp01Icon} size={12} className={className} />
}

export function SortDownIcon({ className }: IconProps) {
  return <P icon={ArrowDown01Icon} size={12} className={className} />
}

export function TagIcon({ className }: IconProps) {
  return <P icon={Tag01Icon} size={15} className={className} />
}

export function DollarIcon({ className }: IconProps) {
  return <P icon={Dollar01Icon} size={15} className={className} />
}

export function MoreIcon({ className }: IconProps) {
  return <P icon={MoreVerticalIcon} size={16} className={className} />
}

export function CaretLeftIcon({ className }: IconProps) {
  return <P icon={ChevronLeftIcon} size={16} className={className} />
}

export function CaretRightIcon({ className }: IconProps) {
  return <P icon={ChevronRightIcon} size={16} className={className} />
}

export function MoneyIcon({ className }: IconProps) {
  return <P icon={DollarCircleIcon} size={16} className={className} />
}

export function StockUpIcon({ className }: IconProps) {
  return <P icon={ChartLineIcon} size={16} className={className} />
}

export function StockDownIcon({ className }: IconProps) {
  return <P icon={ChartLineIcon} size={16} className={className} />
}

export function CalendarIcon({ className }: IconProps) {
  return <P icon={Calendar03Icon} size={15} className={className} />
}

export function ReceiptIcon({ className }: IconProps) {
  return <P icon={ReceiptGlyph} size={15} className={className} />
}

export function AlertIcon({ className }: IconProps) {
  return <P icon={AlertCircleIcon} size={14} className={className} />
}

export function QuestionIcon({ className }: IconProps) {
  return <P icon={CircleQuestionMarkIcon} size={18} className={className} />
}

export function ManualIcon({ className }: IconProps) {
  return <P icon={PencilEdit02Icon} size={14} className={className} />
}

export function EmailIcon({ className }: IconProps) {
  return <P icon={MailIcon} size={14} className={className} />
}

export function CardIcon({ className }: IconProps) {
  return <P icon={CreditCardIcon} size={14} className={className} />
}

export function WalletIcon({ className }: IconProps) {
  return <P icon={WalletGlyph} size={14} className={className} />
}

export function FolderIcon({ className }: IconProps) {
  return <P icon={Folder01Icon} size={16} className={className} />
}

export function BriefcaseIcon({ className }: IconProps) {
  return <P icon={BriefcaseGlyph} size={16} className={className} />
}

export function FileIcon({ className }: IconProps) {
  return <P icon={FileTextIcon} size={16} className={className} />
}

export function BookmarkIcon({ className }: IconProps) {
  return <P icon={BookmarkGlyph} size={16} className={className} />
}
