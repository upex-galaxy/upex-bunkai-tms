# Data-TestID Standards

> **Nota:** Este documento es un template genérico aplicable a cualquier proyecto. Los ejemplos usan diferentes dominios (e-commerce, SaaS, blog, etc.) para ilustrar los patrones. Adapta los nombres al dominio específico de tu proyecto.

Este documento define las convenciones para agregar atributos `data-testid` a los componentes y elementos UI. El objetivo es proveer **identidad estable** a cada elemento: un identificador semántico que sobrevive refactors visuales y permite que cualquier consumidor del DOM (devtools, scripts, automatización futura, herramientas de accesibilidad) localice el elemento de forma predecible.

---

## Por Qué Usar data-testid

- **Estabilidad:** Los selectores basados en `data-testid` no se rompen con cambios de CSS o estructura HTML
- **Claridad:** Identifican el propósito semántico de cada elemento dentro de la UI
- **Independencia:** Desacoplan la identidad del elemento de su implementación visual
- **Mantenibilidad:** Facilitan refactors y la integración con herramientas externas que necesitan localizar elementos del DOM

---

## Dónde Agregar data-testid: Definición vs Uso

### Criterio de Decisión: Mantenibilidad

La decisión de dónde colocar el `data-testid` debe basarse en la **mantenibilidad**. Pregúntate:

1. ¿El componente es genérico o específico del dominio?
2. ¿Se usa en múltiples contextos con diferentes propósitos?
3. ¿Qué ubicación será más fácil de mantener a largo plazo?

### Regla General

| Tipo de Componente                                                                    | Ubicación del data-testid             | Razón                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| **Componentes UI base** (Button, Input, Card, etc.)                                   | Donde se **usa**, NO en la definición | Se usan en múltiples contextos con diferentes propósitos |
| **Componentes de dominio específicos** (ShoppingCart, UserProfile, ArticleCard, etc.) | En la **definición** del componente   | Tienen propósito único, más fácil de mantener            |

---

### Componentes UI Base (NO agregar data-testid en definición)

Los componentes genéricos y reutilizables (Button, Input, Card, Modal, etc.) NO deben tener `data-testid` en su definición porque:

1. Se usan en múltiples contextos con diferentes propósitos
2. El mismo `Button` puede ser `login_button` en un lugar y `add_to_cart_button` en otro
3. El `data-testid` debe reflejar el **propósito específico** del uso

```tsx
// ❌ INCORRECTO: data-testid en la definición del componente genérico
// components/ui/button.tsx
export function Button({ children, ...props }) {
  return (
    <button data-testid="button" {...props}>  {/* MAL - muy genérico */}
      {children}
    </button>
  )
}

// ✅ CORRECTO: data-testid donde se USA el componente
// Ejemplo e-commerce:
<Button data-testid="add_to_cart_button">Agregar al carrito</Button>

// Ejemplo SaaS:
<Button data-testid="upgrade_plan_button">Mejorar plan</Button>

// Ejemplo blog:
<Button data-testid="publish_article_button">Publicar</Button>
```

---

### Componentes de Dominio Específicos (SÍ agregar data-testid en definición)

Los componentes elaborados y específicos del dominio SÍ deben tener `data-testid` en su definición porque:

1. Tienen un propósito único y específico
2. Siempre representan lo mismo donde se usen
3. Es más fácil de mantener (un solo lugar para actualizar)
4. El `data-testid` es parte de su identidad

```tsx
// ✅ CORRECTO: data-testid en la definición del componente específico

// Ejemplo e-commerce:
export function ShoppingCart({ items }) {
  return (
    <aside data-testid="shoppingCart">
      {/* El carrito siempre es "shoppingCart" donde se use */}
    </aside>
  );
}

// Ejemplo SaaS:
export function PricingTable({ plans }) {
  return (
    <div data-testid="pricingTable">{/* La tabla de precios siempre es "pricingTable" */}</div>
  );
}

// Ejemplo blog:
export function ArticleCard({ article }) {
  return (
    <article data-testid="articleCard">{/* Cada card de artículo es "articleCard" */}</article>
  );
}
```

---

## Reglas de Nomenclatura

### 1. Componentes (root): camelCase

El `data-testid` del **elemento raíz** de un componente usa **camelCase** basado en el nombre del componente.

```tsx
// Ejemplos de diferentes dominios:

// E-commerce
export function ProductCard({ product }) {
  return <div data-testid="productCard">...</div>;
}

// SaaS
export function UserDashboard({ user }) {
  return <main data-testid="userDashboard">...</main>;
}

// Blog
export function CommentSection({ comments }) {
  return <section data-testid="commentSection">...</section>;
}

// Red social
export function FriendsList({ friends }) {
  return <ul data-testid="friendsList">...</ul>;
}
```

**Patrón de conversión:**

| Nombre Componente | data-testid    |
| ----------------- | -------------- |
| `ProductCard`     | `productCard`  |
| `ShoppingCart`    | `shoppingCart` |
| `UserProfile`     | `userProfile`  |
| `SearchBar`       | `searchBar`    |
| `Navbar`          | `navbar`       |

### 2. Elementos Específicos Internos: snake_case

Cuando necesitas identificar **elementos específicos dentro de un componente**, usa **snake_case**.

```tsx
// Ejemplo: Formulario de checkout (e-commerce)
export function CheckoutForm({ onSubmit }) {
  return (
    <form data-testid="checkoutForm" onSubmit={onSubmit}>
      <input data-testid="card_number_input" />
      <input data-testid="expiry_date_input" />
      <input data-testid="cvv_input" />
      <button data-testid="pay_button" type="submit">
        Pagar
      </button>
    </form>
  );
}

// Ejemplo: Header de aplicación (genérico)
export function AppHeader() {
  return (
    <header data-testid="appHeader">
      <a data-testid="logo_link" href="/">
        Logo
      </a>
      <nav data-testid="main_nav">...</nav>
      <button data-testid="menu_toggle">Menu</button>
      <div data-testid="user_menu">
        <button data-testid="logout_button">Salir</button>
      </div>
    </header>
  );
}
```

**Patrón de nomenclatura:**

- `{descripcion}_{tipo}` donde tipo puede ser: `input`, `button`, `link`, `container`, `list`, `item`, `section`, etc.

---

## Posicionamiento del data-testid

### Regla Principal: Root del Componente

El `data-testid` debe estar en el **elemento raíz** del componente, permitiendo navegar hacia elementos hijos usando selectores CSS descendientes.

```tsx
// ✅ CORRECTO: data-testid en el root
export function SearchBar() {
  return (
    <div data-testid="searchBar" className="...">
      <input placeholder="Buscar..." />
      <button>Buscar</button>
    </div>
  );
}

// Uso en tests:
// $('[data-testid="searchBar"] input')
// $('[data-testid="searchBar"] button')
```

```tsx
// ❌ INCORRECTO: data-testid solo en elementos internos sin root
export function SearchBar() {
  return (
    <div className="...">
      <input data-testid="searchInput" />
      <button data-testid="searchButton">Buscar</button>
    </div>
  );
}
```

### Elementos Interactivos

Si el componente ES un elemento interactivo (ej: un botón wrapper), el `data-testid` va en el elemento interactivo mismo.

```tsx
// ✅ CORRECTO: El botón ES el componente
export function SubmitButton({ children }) {
  return (
    <button data-testid="submitButton" type="submit">
      {children}
    </button>
  );
}
```

---

## Unicidad: Por Componente, NO Por Instancia

### Regla Fundamental

El `data-testid` es **único por tipo de componente**, NO por cada instancia renderizada.

```tsx
// ✅ CORRECTO: Todas las cards tienen el mismo data-testid

// E-commerce: lista de productos
function ProductList({ products }) {
  return (
    <div data-testid="productList">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
        {/* Cada ProductCard tiene data-testid="productCard" */}
      ))}
    </div>
  )
}

// Uso en tests:
// $$('[data-testid="productCard"]') → Array de todas las cards
// $$('[data-testid="productCard"]')[0] → Primera card
// $('[data-testid="productCard"]:nth-child(2)') → Segunda card
```

### NUNCA Usar IDs Dinámicos

```tsx
// ❌ INCORRECTO: ID dinámico hace el selector impredecible
<div data-testid={`productCard-${product.id}`}>
<div data-testid={`item-${index}`}>

// ✅ CORRECTO: data-testid estático basado en el componente
<div data-testid="productCard">
```

**Razón:** Cualquier consumidor del DOM (devtools, scripts, automatización) combina `data-testid` con:

- Índices: `$$('[data-testid="productCard"]')[2]`
- Selectores CSS: `$('[data-testid="productCard"]:has-text("iPhone")')`
- Atributos: `$('[data-testid="productCard"][data-product-id="123"]')`

---

## Estrategia para Componentes Complejos

Para componentes grandes con múltiples elementos interactivos, aplica **ambas estrategias**: root en camelCase + elementos internos en snake_case.

```tsx
// Ejemplo: Formulario de registro (genérico)
export function RegistrationForm({ onSubmit }) {
  return (
    <form data-testid="registrationForm" onSubmit={onSubmit}>
      {/* Sección de datos personales */}
      <div data-testid="personal_info_section">
        <input data-testid="first_name_input" name="firstName" />
        <input data-testid="last_name_input" name="lastName" />
        <input data-testid="email_input" type="email" />
      </div>

      {/* Sección de seguridad */}
      <div data-testid="security_section">
        <input data-testid="password_input" type="password" />
        <input data-testid="confirm_password_input" type="password" />
      </div>

      {/* Acciones */}
      <div data-testid="form_actions">
        <button data-testid="submit_button" type="submit">
          Crear cuenta
        </button>
        <a data-testid="login_link" href="/login">
          Ya tengo cuenta
        </a>
      </div>
    </form>
  );
}
```

**Selectores disponibles:**

```javascript
// Formulario completo
$('[data-testid="registrationForm"]');

// Campos específicos
$('[data-testid="email_input"]');
$('[data-testid="password_input"]');

// Navegación dentro del componente
$('[data-testid="registrationForm"] [data-testid="submit_button"]');
$('[data-testid="personal_info_section"] input');

// Combinaciones con selectores CSS
$('[data-testid="registrationForm"] button[type="submit"]');
```

---

## Cuándo Agregar data-testid

### SIEMPRE agregar en

1. **Componentes de dominio específicos** (cards, formularios, secciones)
2. **Formularios y sus campos** (inputs, selects, textareas)
3. **Botones de acción** (submit, CTA, navegación)
4. **Elementos de navegación** (navbar, sidebar, tabs, breadcrumbs)
5. **Listas y sus items** (cuando el item es un componente)
6. **Modales y diálogos**
7. **Mensajes de feedback** (errores, éxito, warnings)
8. **Dropdowns y menús**

### Opcional en

1. Elementos puramente decorativos
2. Wrappers de layout sin interacción
3. Iconos (a menos que sean clickeables)

---

## Resumen de Convenciones

| Contexto              | Nomenclatura | Ejemplo                         |
| --------------------- | ------------ | ------------------------------- |
| Componente (root)     | camelCase    | `data-testid="shoppingCart"`    |
| Elemento específico   | snake_case   | `data-testid="email_input"`     |
| Sección de componente | snake_case   | `data-testid="billing_section"` |
| Botón de acción       | snake_case   | `data-testid="checkout_button"` |

---

## Checklist para Implementación

Al implementar un componente, verifica:

- [ ] **Decisión de ubicación:** ¿Es componente genérico (agregar donde se usa) o específico (agregar en definición)?
- [ ] El componente tiene `data-testid` en su elemento raíz (camelCase)
- [ ] Los elementos interactivos importantes tienen `data-testid` (snake_case)
- [ ] NO hay IDs dinámicos en los `data-testid`
- [ ] Los `data-testid` permiten selectores descendientes (`[data-testid="X"] button`)
- [ ] La nomenclatura es consistente (camelCase para componentes, snake_case para elementos)
- [ ] Se consideró la mantenibilidad a largo plazo

---

## Ejemplos por Dominio

### E-commerce: ProductCard

```tsx
export function ProductCard({ product }) {
  return (
    <article data-testid="productCard">
      <img data-testid="product_image" src={product.image} alt={product.name} />
      <h3 data-testid="product_name">{product.name}</h3>
      <p data-testid="product_price">${product.price}</p>
      <div data-testid="product_actions">
        <Button data-testid="add_to_cart_button">Agregar al carrito</Button>
        <Button data-testid="view_details_button" variant="outline">
          Ver detalles
        </Button>
      </div>
    </article>
  );
}
```

### SaaS: PricingCard

```tsx
export function PricingCard({ plan }) {
  return (
    <div data-testid="pricingCard">
      <h3 data-testid="plan_name">{plan.name}</h3>
      <p data-testid="plan_price">${plan.price}/mes</p>
      <ul data-testid="features_list">
        {plan.features.map(feature => (
          <li data-testid="feature_item" key={feature}>
            {feature}
          </li>
        ))}
      </ul>
      <Button data-testid="select_plan_button">Seleccionar plan</Button>
    </div>
  );
}
```

### Blog: ArticleCard

```tsx
export function ArticleCard({ article }) {
  return (
    <article data-testid="articleCard">
      <img data-testid="article_thumbnail" src={article.thumbnail} />
      <h2 data-testid="article_title">{article.title}</h2>
      <p data-testid="article_excerpt">{article.excerpt}</p>
      <div data-testid="article_meta">
        <span data-testid="author_name">{article.author}</span>
        <span data-testid="publish_date">{article.date}</span>
      </div>
      <a data-testid="read_more_link" href={`/articles/${article.slug}`}>
        Leer más
      </a>
    </article>
  );
}
```

### Genérico: Navigation

```tsx
export function MainNavigation() {
  return (
    <nav data-testid="mainNavigation">
      <a data-testid="logo_link" href="/">
        <Logo />
      </a>

      <div data-testid="nav_links">
        <a data-testid="home_link" href="/">
          Inicio
        </a>
        <a data-testid="features_link" href="/features">
          Características
        </a>
        <a data-testid="pricing_link" href="/pricing">
          Precios
        </a>
      </div>

      <div data-testid="auth_actions">
        <Button data-testid="login_button" variant="ghost">
          Iniciar sesión
        </Button>
        <Button data-testid="signup_button">Registrarse</Button>
      </div>
    </nav>
  );
}
```
