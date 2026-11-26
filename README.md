# Meu Dia — contador de calorias grátis

App web (PWA) pra registrar o que você come e o seu peso, feito pra produtos vendidos em Portugal.

**Registrar**
- **Leitor de código de barras ao vivo** pela câmera do celular (EAN-13/EAN-8/UPC), por foto ou digitando
- **Informação nutricional automática** do [Open Food Facts](https://world.openfoodfacts.org) (kcal, proteínas, carboidratos, açúcares, gorduras, saturadas, fibras, sal), com selos **Nutri-Score** e **NOVA**
- **Busca por nome**: seus produtos, receitas, ~65 alimentos genéricos (fruta, arroz, frango…) e o Open Food Facts
- **Adição rápida** quando você só sabe as calorias (restaurante, comida de fora)
- **Favoritos ⭐**, recentes e **combos** (ex: "meu café da manhã de sempre") pra adicionar com um toque
- **Receitas**: junte ingredientes, informe o peso final e as porções, e a receita vira um alimento
- **Copiar refeição ou dia anterior**, duplicar, mover pra hoje, e **desfazer** qualquer remoção
- **Água**: copos que enchem, com meta diária

**Acompanhar**
- Totais do dia com anel por origem das calorias (proteína/carbo/gordura) e metas ajustáveis
- **Calculadora de metas** (Mifflin-St Jeor + atividade + objetivo → calorias e macros)
- **Aba Progresso**: calorias por dia × meta, média, dias dentro da meta, sequência de dias registrados, distribuição de macros, alimentos que mais pesam e **gasto calórico real estimado** (cruza o que você comeu com a tendência do peso)
- **Tracker de peso** com gráfico, média de 7 dias, IMC, progresso até o peso meta e **previsão de quando você chega lá**

**Resto**
- Tema claro/escuro/automático, funciona offline e pode ser instalado na tela inicial
- Backup em JSON (exportar/importar), com lembrete quando faz tempo que você não exporta

Os dados ficam no seu aparelho (localStorage). Nada vai pra servidor nenhum além das consultas ao Open Food Facts, a não ser que você ligue a sincronização.

**Sincronização (opcional)**: em Ajustes → Sincronizar com o GitHub, o app guarda os dados num `data.json` de um repositório **privado** seu, usando um token *fine-grained* com acesso só a esse repo (Contents: Read and write). Assim celular e computador mostram o mesmo diário, e o Claude Code consegue lançar refeições editando o arquivo. A junção é em 3 vias e item a item (refeições por `id`, pesos por data), então dá pra mexer dos dois lados ao mesmo tempo. O app sincroniza ao abrir, depois de cada alteração e a cada minuto com ele aberto.

## Código
Sem build: HTML, CSS e JS puros. Os scripts em `js/` são clássicos (`defer`) e compartilham o escopo global, na ordem do `index.html`:
`core.js` (utilidades, estado, Open Food Facts, folha, toast) → `food.js` (busca, porção, receitas, combos) → `diary.js` → `scanner.js` → `weight.js` → `progress.js` → `settings.js` → `sync.js` (GitHub) → `main.js` (abas e início).

Ao adicionar alimentos genéricos em `foods.js`, coloque sempre **no final**: o id é `gen-<posição>`.
Ao mudar arquivos do app, suba a versão de `CACHE` em `sw.js`.

## Créditos
Leitura de código: [ZXing](https://github.com/zxing-js/library) (Apache-2.0) ou `BarcodeDetector` nativo. Dados de produtos: Open Food Facts (ODbL). Fonte: [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) (SIL Open Font License).
