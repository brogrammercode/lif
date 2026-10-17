import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Bike,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Layers,
  LoaderCircle,
  LogOut,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
  Zap,
  CornerDownRight,
  Grid2X2,
  Upload,
} from "lucide-react";
const icons = {
  app: AppWindow,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  bike: Bike,
  car: Car,
  check: Check,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  error: CircleAlert,
  success: CircleCheck,
  clock: Clock3,
  layers: Layers,
  spinner: LoaderCircle,
  logout: LogOut,
  menu: Menu,
  edit: Pencil,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings2,
  shield: ShieldCheck,
  users: Users,
  close: X,
  zap: Zap,
  child: CornerDownRight,
  grid: Grid2X2,
  upload: Upload,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Component = icons[name];
  return (
    <Component
      size={size}
      strokeWidth={1.7}
      className={className}
      aria-hidden="true"
    />
  );
}
