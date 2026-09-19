import {
  ArrowsLeftRight,
  ArrowDown,
  ArrowUp,
  Bank,
  Bell,
  Bookmark,
  Briefcase,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  ChartBar,
  ChartLineDown,
  ChartLineUp,
  Check,
  CheckCircle,
  CreditCard,
  CurrencyCircleDollar,
  CurrencyDollar,
  DotsThree,
  EnvelopeSimple,
  FileText,
  Folder,
  FunnelSimple,
  GearSix,
  MagnifyingGlass,
  PencilLine,
  Plus,
  Question,
  Receipt,
  SquaresFour,
  Tag,
  Target,
  TrendDown,
  TrendUp,
  UploadSimple,
  Wallet,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr"
import type {
  Icon as PhosphorIcon,
  IconWeight,
} from "@phosphor-icons/react"

// Rift Labs iconography on Phosphor: 24px grid, regular weight across
// the app, filled weight for sidebar navigation. Colors inherit soft
// text tones via currentColor.

interface IconProps {
  className?: string
}

function P({
  icon: Icon,
  size,
  weight = "regular",
  className,
}: IconProps & { icon: PhosphorIcon; size: number; weight?: IconWeight }) {
  return <Icon size={size} weight={weight} className={className} />
}

// ——— Sidebar navigation (filled) ———

export function DashboardIconFull({ className }: IconProps) {
  return <P icon={SquaresFour} size={16} weight="fill" className={className} />
}

export function AccountsIcon({ className }: IconProps) {
  return <P icon={Bank} size={16} weight="fill" className={className} />
}

export function TransactionsIcon({ className }: IconProps) {
  return <P icon={ArrowsLeftRight} size={16} weight="fill" className={className} />
}

export function ReportsIcon({ className }: IconProps) {
  return <P icon={ChartBar} size={16} weight="fill" className={className} />
}

export function InsightsIcon({ className }: IconProps) {
  return <P icon={ChartBar} size={14} weight="fill" className={className} />
}

export function BudgetIcon({ className }: IconProps) {
  return <P icon={Wallet} size={16} weight="fill" className={className} />
}

export function GoalsIcon({ className }: IconProps) {
  return <P icon={Target} size={16} weight="fill" className={className} />
}

export function SettingsIcon({ className }: IconProps) {
  return <P icon={GearSix} size={16} weight="fill" className={className} />
}

// ——— Product UI (regular, soft currentColor tones) ———

export function TrendUpIcon({ className }: IconProps) {
  return <P icon={TrendUp} size={12} className={className} />
}

export function TrendDownIcon({ className }: IconProps) {
  return <P icon={TrendDown} size={12} className={className} />
}

export function CaretDownIcon({ className }: IconProps) {
  return <P icon={CaretDown} size={12} className={className} />
}

export function FilledChevronDownIcon({ className }: IconProps) {
  return <P icon={CaretDown} size={12} weight="fill" className={className} />
}

export function CaretUpDownIcon({ className }: IconProps) {
  return <P icon={CaretUpDown} size={14} className={className} />
}

export function CheckIcon({ className }: IconProps) {
  return <P icon={Check} size={12} className={className} />
}

export function CheckCircleIcon({ className }: IconProps) {
  return <P icon={CheckCircle} size={20} className={className} />
}

export function CloseIcon({ className }: IconProps) {
  return <P icon={X} size={14} className={className} />
}

export function CloseSmallIcon({ className }: IconProps) {
  return <P icon={X} size={12} className={className} />
}

export function UploadIcon({ className }: IconProps) {
  return <P icon={UploadSimple} size={14} className={className} />
}

export function SearchIcon({ className }: IconProps) {
  return <P icon={MagnifyingGlass} size={14} className={className} />
}

export function PlusIcon({ className }: IconProps) {
  return <P icon={Plus} size={14} className={className} />
}

export function BellIcon({ className }: IconProps) {
  return <P icon={Bell} size={16} className={className} />
}

export function FilterIcon({ className }: IconProps) {
  return <P icon={FunnelSimple} size={14} className={className} />
}

export function SortUpIcon({ className }: IconProps) {
  return <P icon={ArrowUp} size={12} className={className} />
}

export function SortDownIcon({ className }: IconProps) {
  return <P icon={ArrowDown} size={12} className={className} />
}

export function TagIcon({ className }: IconProps) {
  return <P icon={Tag} size={15} className={className} />
}

export function DollarIcon({ className }: IconProps) {
  return <P icon={CurrencyDollar} size={15} className={className} />
}

export function MoreIcon({ className }: IconProps) {
  return <P icon={DotsThree} size={16} className={className} />
}

export function CaretLeftIcon({ className }: IconProps) {
  return <P icon={CaretLeft} size={16} className={className} />
}

export function CaretRightIcon({ className }: IconProps) {
  return <P icon={CaretRight} size={16} className={className} />
}

export function MoneyIcon({ className }: IconProps) {
  return <P icon={CurrencyCircleDollar} size={16} className={className} />
}

export function StockUpIcon({ className }: IconProps) {
  return <P icon={ChartLineUp} size={16} className={className} />
}

export function StockDownIcon({ className }: IconProps) {
  return <P icon={ChartLineDown} size={16} className={className} />
}

export function CalendarIcon({ className }: IconProps) {
  return <P icon={CalendarBlank} size={15} className={className} />
}

export function ReceiptIcon({ className }: IconProps) {
  return <P icon={Receipt} size={15} className={className} />
}

export function AlertIcon({ className }: IconProps) {
  return <P icon={WarningCircle} size={14} className={className} />
}

export function QuestionIcon({ className }: IconProps) {
  return <P icon={Question} size={18} className={className} />
}

export function ManualIcon({ className }: IconProps) {
  return <P icon={PencilLine} size={14} className={className} />
}

export function EmailIcon({ className }: IconProps) {
  return <P icon={EnvelopeSimple} size={14} className={className} />
}

export function CardIcon({ className }: IconProps) {
  return <P icon={CreditCard} size={14} className={className} />
}

export function WalletIcon({ className }: IconProps) {
  return <P icon={Wallet} size={14} className={className} />
}

export function FolderIcon({ className }: IconProps) {
  return <P icon={Folder} size={16} className={className} />
}

export function BriefcaseIcon({ className }: IconProps) {
  return <P icon={Briefcase} size={16} className={className} />
}

export function FileIcon({ className }: IconProps) {
  return <P icon={FileText} size={16} className={className} />
}

export function BookmarkIcon({ className }: IconProps) {
  return <P icon={Bookmark} size={16} className={className} />
}
