# Meu Dia — contador de calorias grátis

App web (PWA) pra registrar o que você come e o seu peso, feito pra produtos vendidos em Portugal.

- **Leitor de código de barras ao vivo** pela câmera do celular (EAN-13/EAN-8/UPC)
- **Informação nutricional automática** do [Open Food Facts](https://world.openfoodfacts.org) (kcal, proteínas, carboidratos, açúcares, gorduras, saturadas, fibras, sal)
- **Busca por nome**: seus produtos, ~60 alimentos genéricos (fruta, arroz, frango…) e o Open Food Facts
- Totais do dia por refeição, metas ajustáveis (padrão: valores de referência da UE)
- **Tracker de peso** com gráfico, média de 7 dias, variação, IMC e peso meta
- Funciona offline e pode ser instalado na tela inicial
- Backup em JSON (exportar/importar)

Os dados ficam **só no seu aparelho** (localStorage) — nada vai pra servidor nenhum além das consultas ao Open Food Facts.

Leitura de código: [ZXing](https://github.com/zxing-js/library) (Apache-2.0) ou `BarcodeDetector` nativo. Dados de produtos: Open Food Facts (ODbL).
