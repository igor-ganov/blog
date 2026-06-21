---
title: 'Без Material по умолчанию; стройте на Web Platform'
category: angular
summary: "Если проект ещё не использует Material Design, не добавляйте его — собирайте свои компоненты на современных API Web Platform и анимируйте нативным CSS."
principle: "Если проект ещё не использует Material Design, не добавляйте его — собирайте свои компоненты на современных API Web Platform; предпочитайте нативный CSS анимациям Angular."
severity: context
tags: [angular, material, web-platform, css, animations, components]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'Никакого Material, если он ещё не используется; нативная Web Platform; нативный CSS вместо анимаций Angular.'
related:
  - web-components/lit-functional-core
  - design-ux/minimalism-no-emoji-schematic
order: 6
updated: 2026-06-10
---

Angular Material — это целая дизайн-система. Он приносит навязанный визуальный язык, токены
тем, набор готовых компонентов и собственную библиотеку анимаций, и за эту полноту вы платите.
Если проект завязан на Material Design (его типографическую шкалу, модель теней и поведение
компонентов), Angular Material оправдывает своё место. Если у проекта уже есть собственный
язык дизайна, тянуть Angular Material только ради кнопки или диалога — значит брать целую
систему ради одного её кусочка.

Так что правило зависит от проекта. **Сначала проверьте.** Проект, который уже использует
Angular Material, пусть продолжает использовать его ради согласованности. Проект, который не
использует, должен тянуться к Web Platform: она уже даёт диалоги, поповеры, переходы и
анимации, привязанные к прокрутке.

## Почему это важно

### Цена бандла

Angular Material тянет за собой `@angular/cdk`, собственный SCSS для тем и набор модулей
компонентов. Даже с tree-shaking один компонент диалога добавляет десятки килобайт
скомпилированного CSS и JavaScript. Нативный элемент `<dialog>` стоит ноль килобайт, потому
что он уже есть в браузере.

### Несовпадение с кастомным дизайном

Кастомная дизайн-система и Angular Material конфликтуют. Внутренности компонентов Material
несут собственное пространство имён CSS-переменных, собственную шкалу теней и собственные
токены движения. Их можно переопределить в файле темы, но это хрупкая работа, потому что
внутренние имена переменных Material меняются между мажорными версиями. Один проект WebRTC-платформы
выбрал headless-компоненты на примитивах web platform именно затем, чтобы уйти от этой
связанности, чтобы стиль каждого компонента целиком жил под собственными дизайн-токенами проекта.

### Анимации Angular против нативного CSS

Модуль Angular `@angular/animations` — это система анимаций, управляемая через JavaScript. Он
поставляет собственный рантайм, его нужно поднимать через `provideAnimations()`, и он гоняет
анимации через программные смены состояний. Нативный CSS покрывает то же поле (переходы,
keyframe-анимации, эффекты по прокрутке, `View Transitions API`) без накладных расходов на
JavaScript, с меньшей задержкой, потому что нет моста JS-в-стили, и с аппаратным ускорением
по умолчанию.

Для дискретного состояния интерфейса — наведения на кнопку, появления бейджа, выезжающего
ящика — CSS-`transition` по смене класса, запущенной сигналом, справляется без лишних импортов.

## Как применять

### Проверьте перед добавлением

Прежде чем ставить `@angular/material`, проверьте, есть ли `@angular/material` уже в
`package.json`. Если есть — используйте его последовательно. Если нет — остановитесь, не
добавляйте.

```bash
# If this prints a version number, the project uses Material — stay consistent.
# If it prints nothing, do not add it.
cat package.json | grep '@angular/material'
```

### Используйте нативный HTML для интерактивных элементов

Современный HTML даёт интерактивность, которая раньше требовала библиотеки.

**Диалог / модальное окно**

```typescript
// Bad — adds @angular/material and MatDialog for a modal
import { MatDialog } from '@angular/material/dialog';

@Component({ /* ... */ })
export class HostComponent {
  private readonly dialog = inject(MatDialog);

  openConfirm(): void {
    this.dialog.open(ConfirmDialogComponent, { width: '400px' });
  }
}

// Good — native <dialog> element, zero dependencies
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <dialog #dialogEl>
      <h2>{{ title() }}</h2>
      <p>{{ message() }}</p>
      <menu>
        <button (click)="cancel()">Cancel</button>
        <button (click)="confirm()">Confirm</button>
      </menu>
    </dialog>
  `,
  styles: [`
    :host { display: contents; }
    dialog {
      border: none;
      border-radius: 0.5rem;
      padding: 1.5rem;
      box-shadow: var(--shadow-lg);
    }
    dialog::backdrop {
      background: rgb(0 0 0 / 0.5);
    }
  `],
})
export class ConfirmDialogComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmed = output<boolean>();

  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dialogEl');

  open(): void {
    this.dialogEl().nativeElement.showModal();
  }

  confirm(): void {
    this.dialogEl().nativeElement.close();
    this.confirmed.emit(true);
  }

  cancel(): void {
    this.dialogEl().nativeElement.close();
    this.confirmed.emit(false);
  }
}
```

**Поповер**

Popover API теперь доступен как baseline во всех современных браузерах. Атрибут `popover`
плюс атрибут `popovertarget` начисто заменяют компонент плавающей панели:

```typescript
@Component({
  selector: 'app-action-menu',
  standalone: true,
  template: `
    <button popovertarget="action-menu-popover">Actions</button>
    <menu id="action-menu-popover" popover>
      <li><button (click)="edit.emit()">Edit</button></li>
      <li><button (click)="delete.emit()">Delete</button></li>
    </menu>
  `,
  styles: [`
    :host { display: inline-block; position: relative; }
    menu[popover] {
      border: 1px solid var(--color-border);
      border-radius: 0.375rem;
      padding: 0.25rem;
      list-style: none;
    }
  `],
})
export class ActionMenuComponent {
  readonly edit = output<void>();
  readonly delete = output<void>();
}
```

### Анимируйте нативным CSS, а не @angular/animations

```typescript
// Bad — BrowserAnimationsModule + trigger() for a simple fade
import { trigger, state, style, animate, transition } from '@angular/animations';

@Component({
  animations: [
    trigger('fade', [
      state('visible', style({ opacity: 1 })),
      state('hidden', style({ opacity: 0 })),
      transition('visible <=> hidden', [animate('200ms ease-in-out')]),
    ]),
  ],
  template: `<section [@fade]="isVisible() ? 'visible' : 'hidden'">...</section>`,
})
export class PanelComponent {
  readonly isVisible = signal(true);
}

// Good — CSS transition triggered by a [class] binding; zero runtime cost
@Component({
  selector: 'app-panel',
  standalone: true,
  template: `
    <section [class.panel--hidden]="!isVisible()">
      <ng-content />
    </section>
  `,
  styles: [`
    section {
      opacity: 1;
      transition: opacity 200ms ease-in-out;
    }
    section.panel--hidden {
      opacity: 0;
      pointer-events: none;
    }
  `],
})
export class PanelComponent {
  readonly isVisible = input(true);
}
```

Для анимаций входа и выхода CSS-`@starting-style` (baseline 2024) убирает последнюю причину
использовать анимации Angular для дискретных переходов состояний:

```css
/* Animates opacity from 0 on initial render, then stays at 1 */
section {
  opacity: 1;
  transition: opacity 200ms ease-in-out;
}

@starting-style {
  section {
    opacity: 0;
  }
}
```

Для анимаций по прокрутке Scroll-driven Animations API (`animation-timeline:
scroll()`) — это baseline 2024, и ему не нужен никакой JavaScript.

### Headless-компоненты вместо обёрток над библиотеками

И WebRTC-платформа, и headless-библиотека веб-компонентов используют headless-компоненты.
Компонент задаёт поведение и отдаёт корректную по ARIA разметку, а вся стилизация приходит
из дизайн-токенов хост-проекта. Что это даёт:

- Нет зависимости от версии стороннего набора компонентов.
- Нет унаследованного навязанного CSS, который потом приходится переопределять.
- Доступность, которую можно проверить, потому что ARIA явно прописана в шаблоне.

```typescript
// A headless tabs component — behaviour only; styling entirely via CSS variables
@Component({
  selector: 'app-tabs',
  standalone: true,
  template: `
    <nav role="tablist">
      @for (tab of tabs(); track tab.id) {
        <button
          role="tab"
          [id]="'tab-' + tab.id"
          [attr.aria-controls]="'panel-' + tab.id"
          [attr.aria-selected]="selectedId() === tab.id"
          [class.tab--selected]="selectedId() === tab.id"
          (click)="select(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </nav>
    @for (tab of tabs(); track tab.id) {
      <section
        role="tabpanel"
        [id]="'panel-' + tab.id"
        [attr.aria-labelledby]="'tab-' + tab.id"
        [class.panel--active]="selectedId() === tab.id"
      >
        @if (selectedId() === tab.id) {
          <ng-content [select]="'[slot=' + tab.id + ']'" />
        }
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    nav { display: flex; border-bottom: 1px solid var(--color-border); }
    button[role=tab] { /* base styles; project overrides via CSS variables */ }
    .tab--selected { border-bottom: 2px solid var(--color-primary); }
    .panel--active { display: block; }
    section[role=tabpanel]:not(.panel--active) { display: none; }
  `],
})
export class TabsComponent {
  readonly tabs = input.required<readonly Tab[]>();
  private readonly _selectedId = signal<string | undefined>(undefined);
  readonly selectedId = computed(() => this._selectedId() ?? this.tabs()[0]?.id);
  readonly select = (id: string): void => this._selectedId.set(id);
}
```

Ни библиотеки, ни CDK, ни Material — только платформа.

## Антипаттерны

```typescript
// Anti-pattern 1: Adding @angular/material for a single component
// The surface area — bundle size, theming, CDK — is disproportionate to the need.
// Build the one component yourself with the Web Platform.
import { MatButtonModule } from '@angular/material/button'; // 23 KB + CDK + theming

// Anti-pattern 2: Using Angular animations for CSS-achievable effects
// @angular/animations is a JavaScript animation runtime. CSS transitions are cheaper,
// simpler, and hardware-accelerated. Use the runtime only when the Web Platform
// genuinely cannot model the animation.
animations: [trigger('slide', [...])]
// Fix: [class.slide-in]="condition" + CSS transition

// Anti-pattern 3: Overriding Material internals with ::ng-deep
// When you override Material's internal selectors, you are depending on its DOM
// structure, which changes without notice between minor versions.
::ng-deep .mat-mdc-dialog-container { padding: 0; }
// Fix: either stay within Material's theming API, or remove Material and build your own.

// Anti-pattern 4: provideAnimations() in a project that doesn't use @angular/animations
// This adds the animation runtime to the bundle even if no animation trigger is used.
bootstrapApplication(AppComponent, {
  providers: [provideAnimations()], // unnecessary if no trigger() is in the app
});
```

## Смотрите также

- [ARIA на реальном элементе](/kb/web-components/aria-on-the-real-element) — подход к
  доступности, стоящий за паттерном headless-компонента, который применяется здесь.
- [Минимализм и схематичный дизайн](/kb/design-ux/minimalism-no-emoji-schematic) —
  философия дизайна, которая идёт вместе со сборкой лёгких компонентов на токенах.
