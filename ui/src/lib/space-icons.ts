import {
  BookOpen,
  Bot,
  Brain,
  Calculator,
  Calendar,
  Camera,
  Code,
  FlaskConical,
  Folder,
  Gamepad2,
  Globe,
  Heart,
  House,
  Lightbulb,
  Music,
  Palette,
  Plane,
  Popcorn,
  Rocket,
  ShoppingCart,
  Star,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const DEFAULT_SPACE_ICON = "folder";

/** Iconos que se pueden elegir para un proyecto, por nombre persistido. */
export const SPACE_ICONS: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: "folder", label: "Carpeta", Icon: Folder },
  { name: "code", label: "Código", Icon: Code },
  { name: "rocket", label: "Cohete", Icon: Rocket },
  { name: "bot", label: "Robot", Icon: Bot },
  { name: "wrench", label: "Llave inglesa", Icon: Wrench },
  { name: "flask", label: "Matraz", Icon: FlaskConical },
  { name: "brain", label: "Cerebro", Icon: Brain },
  { name: "lightbulb", label: "Bombilla", Icon: Lightbulb },
  { name: "palette", label: "Paleta", Icon: Palette },
  { name: "book", label: "Libro", Icon: BookOpen },
  { name: "calendar", label: "Calendario", Icon: Calendar },
  { name: "calculator", label: "Calculadora", Icon: Calculator },
  { name: "house", label: "Casa", Icon: House },
  { name: "cart", label: "Carrito", Icon: ShoppingCart },
  { name: "globe", label: "Mundo", Icon: Globe },
  { name: "plane", label: "Avión", Icon: Plane },
  { name: "gamepad", label: "Mando", Icon: Gamepad2 },
  { name: "music", label: "Música", Icon: Music },
  { name: "camera", label: "Cámara", Icon: Camera },
  { name: "popcorn", label: "Palomitas", Icon: Popcorn },
  { name: "heart", label: "Corazón", Icon: Heart },
  { name: "star", label: "Estrella", Icon: Star },
];

export function spaceIcon(name: string | undefined): LucideIcon {
  return SPACE_ICONS.find((icon) => icon.name === name)?.Icon ?? Folder;
}
