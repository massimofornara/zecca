import { cookies } from "next/headers";

export type CartLine = { productId: string; quantity: number };

const COOKIE = "zecca_cart";

export async function getCart(): Promise<CartLine[]> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l) => l.productId && l.quantity > 0);
  } catch {
    return [];
  }
}

export async function setCart(items: CartLine[]) {
  const store = await cookies();
  const cleaned = items.filter((l) => l.quantity > 0);
  store.set(COOKIE, JSON.stringify(cleaned), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function addToCart(productId: string, quantity = 1) {
  const cart = await getCart();
  const existing = cart.find((l) => l.productId === productId);
  if (existing) existing.quantity += quantity;
  else cart.push({ productId, quantity });
  await setCart(cart);
  return cart;
}

export async function updateCartQuantity(productId: string, quantity: number) {
  const cart = await getCart();
  const next = cart
    .map((l) => (l.productId === productId ? { ...l, quantity } : l))
    .filter((l) => l.quantity > 0);
  await setCart(next);
  return next;
}

export async function clearCart() {
  await setCart([]);
}

export function cartCount(items: CartLine[]) {
  return items.reduce((sum, l) => sum + l.quantity, 0);
}
