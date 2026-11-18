# Data-TestID Standards

This is a generic template for any project. The examples draw on different domains (e-commerce, SaaS, blog) to show the patterns, so adapt the names to your own domain.

**Existing conventions win.** This standard is the default for an app with no test-id convention. If `{{stack.conventions.testid_style}}` is set, or the app's code already uses another attribute or case, follow the app's. Never rename, re-case or delete an existing test id, because another tool (a QA suite, an analytics tag) may select on it (`../SKILL.md`, section `## Stack parameters`).

The convention gives every UI element a **stable identity**: a semantic identifier that survives visual refactors and lets any consumer of the DOM (devtools, scripts, future automation, accessibility tools) find the element predictably.

---

## Why use data-testid

- **Stability.** Selectors based on `data-testid` do not break when CSS or the HTML structure changes.
- **Clarity.** They name the semantic purpose of each element in the UI.
- **Independence.** They separate an element's identity from its visual implementation.
- **Maintainability.** They make refactors easier, and external tools can locate DOM elements through them.

---

## Where to add data-testid: definition vs usage

### Decision criterion: maintainability

Place the `data-testid` where it is easiest to maintain. Ask:

1. Is the component generic or specific to the domain?
2. Is it used in several contexts with different purposes?
3. Which location will be easier to maintain in the long run?

### General rule

| Component type                                                                       | Where the data-testid goes                | Reason                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------- |
| **Base UI components** (Button, Input, Card, etc.)                                   | Where it is **used**, not in the definition | They are used in many contexts with different purposes |
| **Domain-specific components** (ShoppingCart, UserProfile, ArticleCard, etc.)        | In the component's **definition**         | They have one purpose, so one place to maintain         |

---

### Base UI components (no data-testid in the definition)

Generic, reusable components (Button, Input, Card, Modal, etc.) get no `data-testid` in their definition, because:

1. They are used in many contexts with different purposes.
2. The same `Button` can be `login_button` in one place and `add_to_cart_button` in another.
3. The `data-testid` should reflect the **specific purpose** of the usage.

```tsx
// INCORRECT: data-testid in the definition of a generic component
// components/ui/button.tsx
export function Button({ children, ...props }) {
  return (
    <button data-testid="button" {...props}>  {/* BAD: too generic */}
      {children}
    </button>
  )
}

// CORRECT: data-testid where the component is USED
// E-commerce example:
<Button data-testid="add_to_cart_button">Add to cart</Button>

// SaaS example:
<Button data-testid="upgrade_plan_button">Upgrade plan</Button>

// Blog example:
<Button data-testid="publish_article_button">Publish</Button>
```

---

### Domain-specific components (data-testid in the definition)

Elaborate, domain-specific components get a `data-testid` in their definition, because:

1. They have one specific purpose.
2. They always represent the same thing wherever they are used.
3. There is a single place to update.
4. The `data-testid` is part of their identity.

```tsx
// CORRECT: data-testid in the definition of the specific component

// E-commerce example:
export function ShoppingCart({ items }) {
  return (
    <aside data-testid="shoppingCart">
      {/* The cart is always "shoppingCart" wherever it is used */}
    </aside>
  );
}

// SaaS example:
export function PricingTable({ plans }) {
  return (
    <div data-testid="pricingTable">{/* The pricing table is always "pricingTable" */}</div>
  );
}

// Blog example:
export function ArticleCard({ article }) {
  return (
    <article data-testid="articleCard">{/* Every article card is "articleCard" */}</article>
  );
}
```

---

## Naming rules

### 1. Components (root): camelCase

The `data-testid` of a component's **root element** is **camelCase**, based on the component name.

```tsx
// Examples from different domains:

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

// Social network
export function FriendsList({ friends }) {
  return <ul data-testid="friendsList">...</ul>;
}
```

**Conversion pattern:**

| Component name | data-testid    |
| -------------- | -------------- |
| `ProductCard`  | `productCard`  |
| `ShoppingCart` | `shoppingCart` |
| `UserProfile`  | `userProfile`  |
| `SearchBar`    | `searchBar`    |
| `Navbar`       | `navbar`       |

### 2. Specific internal elements: snake_case

To identify **specific elements inside a component**, use **snake_case**.

```tsx
// Example: checkout form (e-commerce)
export function CheckoutForm({ onSubmit }) {
  return (
    <form data-testid="checkoutForm" onSubmit={onSubmit}>
      <input data-testid="card_number_input" />
      <input data-testid="expiry_date_input" />
      <input data-testid="cvv_input" />
      <button data-testid="pay_button" type="submit">
        Pay
      </button>
    </form>
  );
}

// Example: application header (generic)
export function AppHeader() {
  return (
    <header data-testid="appHeader">
      <a data-testid="logo_link" href="/">
        Logo
      </a>
      <nav data-testid="main_nav">...</nav>
      <button data-testid="menu_toggle">Menu</button>
      <div data-testid="user_menu">
        <button data-testid="logout_button">Log out</button>
      </div>
    </header>
  );
}
```

**Naming pattern:**

- `{description}_{type}`, where type is one of `input`, `button`, `link`, `container`, `list`, `item`, `section`, etc.

---

## Placing the data-testid

### Main rule: the component root

Put the `data-testid` on the component's **root element**. Descendant CSS selectors then reach the child elements.

```tsx
// CORRECT: data-testid on the root
export function SearchBar() {
  return (
    <div data-testid="searchBar" className="...">
      <input placeholder="Search..." />
      <button>Search</button>
    </div>
  );
}

// Usage in tests:
// $('[data-testid="searchBar"] input')
// $('[data-testid="searchBar"] button')
```

```tsx
// INCORRECT: data-testid only on inner elements, none on the root
export function SearchBar() {
  return (
    <div className="...">
      <input data-testid="searchInput" />
      <button data-testid="searchButton">Search</button>
    </div>
  );
}
```

### Interactive elements

If the component IS an interactive element (for example a button wrapper), the `data-testid` goes on that interactive element itself.

```tsx
// CORRECT: the button IS the component
export function SubmitButton({ children }) {
  return (
    <button data-testid="submitButton" type="submit">
      {children}
    </button>
  );
}
```

---

## Uniqueness: per component, not per instance

### Fundamental rule

The `data-testid` is **unique per component type**, not per rendered instance.

```tsx
// CORRECT: every card has the same data-testid

// E-commerce: product list
function ProductList({ products }) {
  return (
    <div data-testid="productList">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
        {/* Every ProductCard has data-testid="productCard" */}
      ))}
    </div>
  )
}

// Usage in tests:
// $$('[data-testid="productCard"]') -> array of all the cards
// $$('[data-testid="productCard"]')[0] -> first card
// $('[data-testid="productCard"]:nth-child(2)') -> second card
```

### Static ids only

```tsx
// INCORRECT: a dynamic id makes the selector unpredictable
<div data-testid={`productCard-${product.id}`}>
<div data-testid={`item-${index}`}>

// CORRECT: a static data-testid based on the component
<div data-testid="productCard">
```

**Reason:** any consumer of the DOM (devtools, scripts, automation) combines `data-testid` with:

- Indexes: `$$('[data-testid="productCard"]')[2]`
- CSS selectors: `$('[data-testid="productCard"]:has-text("iPhone")')`
- Attributes: `$('[data-testid="productCard"][data-product-id="123"]')`

---

## Strategy for complex components

A large component with many interactive elements uses **both strategies**: camelCase on the root, snake_case on the inner elements.

```tsx
// Example: registration form (generic)
export function RegistrationForm({ onSubmit }) {
  return (
    <form data-testid="registrationForm" onSubmit={onSubmit}>
      {/* Personal data section */}
      <div data-testid="personal_info_section">
        <input data-testid="first_name_input" name="firstName" />
        <input data-testid="last_name_input" name="lastName" />
        <input data-testid="email_input" type="email" />
      </div>

      {/* Security section */}
      <div data-testid="security_section">
        <input data-testid="password_input" type="password" />
        <input data-testid="confirm_password_input" type="password" />
      </div>

      {/* Actions */}
      <div data-testid="form_actions">
        <button data-testid="submit_button" type="submit">
          Create account
        </button>
        <a data-testid="login_link" href="/login">
          I already have an account
        </a>
      </div>
    </form>
  );
}
```

**Available selectors:**

```javascript
// The whole form
$('[data-testid="registrationForm"]');

// Specific fields
$('[data-testid="email_input"]');
$('[data-testid="password_input"]');

// Navigating inside the component
$('[data-testid="registrationForm"] [data-testid="submit_button"]');
$('[data-testid="personal_info_section"] input');

// Combined with CSS selectors
$('[data-testid="registrationForm"] button[type="submit"]');
```

---

## When to add a data-testid

### Add one on

1. **Domain-specific components** (cards, forms, sections)
2. **Forms and their fields** (inputs, selects, textareas)
3. **Action buttons** (submit, CTA, navigation)
4. **Navigation elements** (navbar, sidebar, tabs, breadcrumbs)
5. **Lists and their items** (when the item is a component)
6. **Modals and dialogs**
7. **Feedback messages** (errors, success, warnings)
8. **Dropdowns and menus**

### Optional on

1. Purely decorative elements
2. Layout wrappers without interaction
3. Icons (unless they are clickable)

---

## Convention summary

| Context            | Naming     | Example                         |
| ------------------ | ---------- | ------------------------------- |
| Component (root)   | camelCase  | `data-testid="shoppingCart"`    |
| Specific element   | snake_case | `data-testid="email_input"`     |
| Component section  | snake_case | `data-testid="billing_section"` |
| Action button      | snake_case | `data-testid="checkout_button"` |

---

## Implementation checklist

When you implement a component, check:

- [ ] **Placement decision:** is it a generic component (add where it is used) or a specific one (add in the definition)?
- [ ] The component has a `data-testid` on its root element (camelCase)
- [ ] The important interactive elements have a `data-testid` (snake_case)
- [ ] No dynamic ids in any `data-testid`
- [ ] The `data-testid` values allow descendant selectors (`[data-testid="X"] button`)
- [ ] Naming is consistent (camelCase for components, snake_case for elements)
- [ ] Long-term maintainability was considered

---

## Examples by domain

### E-commerce: ProductCard

```tsx
export function ProductCard({ product }) {
  return (
    <article data-testid="productCard">
      <img data-testid="product_image" src={product.image} alt={product.name} />
      <h3 data-testid="product_name">{product.name}</h3>
      <p data-testid="product_price">${product.price}</p>
      <div data-testid="product_actions">
        <Button data-testid="add_to_cart_button">Add to cart</Button>
        <Button data-testid="view_details_button" variant="outline">
          View details
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
      <p data-testid="plan_price">${plan.price}/month</p>
      <ul data-testid="features_list">
        {plan.features.map(feature => (
          <li data-testid="feature_item" key={feature}>
            {feature}
          </li>
        ))}
      </ul>
      <Button data-testid="select_plan_button">Select plan</Button>
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
        Read more
      </a>
    </article>
  );
}
```

### Generic: Navigation

```tsx
export function MainNavigation() {
  return (
    <nav data-testid="mainNavigation">
      <a data-testid="logo_link" href="/">
        <Logo />
      </a>

      <div data-testid="nav_links">
        <a data-testid="home_link" href="/">
          Home
        </a>
        <a data-testid="features_link" href="/features">
          Features
        </a>
        <a data-testid="pricing_link" href="/pricing">
          Pricing
        </a>
      </div>

      <div data-testid="auth_actions">
        <Button data-testid="login_button" variant="ghost">
          Log in
        </Button>
        <Button data-testid="signup_button">Sign up</Button>
      </div>
    </nav>
  );
}
```
