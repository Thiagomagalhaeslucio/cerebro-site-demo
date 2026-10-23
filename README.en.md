# cérebro

[Português](README.md)

A local website that shows what is in my Obsidian notes as pages and charts: agenda, weekly kanban, personal finance, study roadmaps, a pricing calculator, a proposal generator and a contract generator. The vault is the source of truth and the site only reads it, with one exception: the finance page "Lançar movimento" (`/financeiro/lancar`), which writes only `40-financeiro/panelas.md` and `movimentos.md` behind a session token, origin checks, a version check, an in-memory verification and atomic writes (details in the [Portuguese README](README.md#lançar-movimento-a-única-escrita)). Records are otherwise made in the terminal or in Obsidian; the pages reflect them.

**No AI at runtime. No database. Live updates.**

The UI is in Brazilian Portuguese, and so are the file formats and docs. The full documentation is in the [Portuguese README](README.md).

## Screenshots

Demo mode (`npm run demo`): example vault, invented data, date fixed at 2026-03-10.

| Light | Dark |
|---|---|
| ![Home, light theme](docs/capturas/home-claro.png) | ![Home, dark theme](docs/capturas/home-escuro.png) |
| ![Agenda, next days, light](docs/capturas/agenda-claro.png) | ![Agenda, next days, dark](docs/capturas/agenda-escuro.png) |
| ![Agenda, month, light](docs/capturas/agenda-mes-claro.png) | ![Agenda, month, dark](docs/capturas/agenda-mes-escuro.png) |
| ![Weekly kanban, light](docs/capturas/kanban-claro.png) | ![Weekly kanban, dark](docs/capturas/kanban-escuro.png) |
| ![Finance, light](docs/capturas/financeiro-claro.png) | ![Finance, dark](docs/capturas/financeiro-escuro.png) |
| ![Finance diagnosis, light](docs/capturas/diagnostico-claro.png) | ![Finance diagnosis, dark](docs/capturas/diagnostico-escuro.png) |
| ![Studies, light](docs/capturas/estudos-claro.png) | ![Studies, dark](docs/capturas/estudos-escuro.png) |
| ![Goals, light](docs/capturas/metas-claro.png) | ![Goals, dark](docs/capturas/metas-escuro.png) |
| ![Time, light](docs/capturas/tempo-claro.png) | ![Time, dark](docs/capturas/tempo-escuro.png) |
| ![Library, light](docs/capturas/biblioteca-claro.png) | ![Library, dark](docs/capturas/biblioteca-escuro.png) |
| ![Work in progress, light](docs/capturas/demandas-claro.png) | ![Work in progress, dark](docs/capturas/demandas-escuro.png) |
| ![Reports, light](docs/capturas/relatorios-claro.png) | ![Reports, dark](docs/capturas/relatorios-escuro.png) |
| ![Pricing calculator, light](docs/capturas/orcamento-claro.png) | ![Pricing calculator, dark](docs/capturas/orcamento-escuro.png) |
| ![Proposal generator, light](docs/capturas/propostas-claro.png) | ![Proposal generator, dark](docs/capturas/propostas-escuro.png) |
| ![Contract generator, light](docs/capturas/contratos-claro.png) | ![Contract generator, dark](docs/capturas/contratos-escuro.png) |

On a phone (500px wide): Home in the dark theme, and the open menu in the light theme.

| Home | Open menu |
|---|---|
| ![Home on a phone](docs/capturas/celular-home-escuro.png) | ![Open menu on a phone](docs/capturas/celular-menu-claro.png) |

To regenerate them: `npm run capturas`. It needs Firefox on the PATH and no npm dependencies (`scripts/capturas.js` speaks Marionette over `node:net`). It starts `npm run demo` if port 3738 is free, uses a throwaway Firefox profile with reduced motion, freezes the browser clock at 2026-03-10 12:00, waits for each page to finish loading, and checks it is showing the demo vault before every shot. Details in the [Portuguese README](README.md#regerar-as-capturas).

## How it works

A Node server reads the vault's Markdown files on every request and turns tables, frontmatter and checkboxes into JSON. The pages are static HTML and JavaScript that consume that API. `fs.watch` observes the vault folders; when a `.md` file changes, the server notifies open pages over Server-Sent Events and they fetch the API again. There is no route that writes, so the site can never overwrite your notes.

- Listens on `127.0.0.1` only, validates the `Host` header, accepts only `GET` and `HEAD`.
- CSP `default-src 'self'`: no CDN, Chart.js and fonts come from `node_modules`.
- Generated documents are built with DOM nodes, never `innerHTML`.
- Business rules are deterministic and live in `config.json` and in the vault.
- A test checks that the proposal and the contract sent to a client never contain the price floor, risk margin or hourly rate.
- Contract parties' tax IDs and addresses live only in page memory: never in the URL, browser storage or on the server.

## Run it

Requires Node 20 or newer.

```sh
npm install
npm start          # http://127.0.0.1:3737, reads $HOME/cerebro
npm run demo       # http://127.0.0.1:3738, example vault (invented data)
npm test           # 121 tests
```

Another vault: `CEREBRO_VAULT=/path npm start` or `npm start -- --vault=/path`.

## Built with AI

Built with help from AI (Claude and Claude Code). Product decisions and business rules are the author's and are recorded in [`docs/design.md`](docs/design.md) and in the tests.

## License

All rights reserved for now.
