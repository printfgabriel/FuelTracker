# FuelTracker — Especificação de Exigências e Validação do Projeto

Este documento consolida todas as exigências funcionais, matemáticas, estatísticas, de desempenho e de qualidade do projeto **FuelTracker** (Exigência 6), servindo como contrato vivo para validação e reavaliação contínua.

---

## 1. Visão Geral e Objetivo

O **FuelTracker** é um aplicativo Android/Web *Local-First* para rastreamento de abastecimentos e análise estatística de consumo automotivo, projetado para superar as limitações do Fuelio ao:
1. Estimar o consumo médio mesmo em abastecimentos **parciais** (sem precisar encher o tanque até o automático), utilizando o nível do marcador do painel em **"palitinhos"**;
2. Realizar **validação cruzada** automática das especificações do veículo com base de dados pública (Tabela FIPE + catálogo técnico PBEV/INMETRO) no momento do cadastro;
3. Aplicar **métodos estatísticos formais** para avaliar a qualidade do consumo nos últimos intervalos e emitir **mini-alertas** quando houver aumento de consumo estatisticamente significativo;
4. Separar rigorosamente **Gasolina** (padrão/default) e **Álcool (Etanol)**, incluindo comparativo econômico e energético entre ambos;
5. Garantir inicialização e resposta **ultrarrápidas**, com armazenamento local imediato e opção de sincronização em nuvem na Conta Google (Google Drive).

---

## 2. Exigências do Projeto

### REQ-00 — Fluxo Base de Abastecimento (Superando o Fuelio)
- **Descrição:** Ao registrar um abastecimento, o usuário informa **Preço por Litro (R$/L)** e **Valor Total (R$)**, e o aplicativo calcula automaticamente a quantidade de **Litros (L)** abastecida ($L = \text{ValorTotal} / \text{PreçoPorLitro}$). Também permite editar litros para recalcular o valor total.
- **Métricas Base:** O aplicativo calcula e exibe gastos mensais (R$), litros abastecidos por mês, preço médio pago por combustível e custo por quilômetro (R$/km) com gráficos de acompanhamento.
- **Critério de Aceitação:**
  - $L = \text{round}_3(\text{ValorTotal} / \text{PreçoPorLitro})$ quando $\text{ValorTotal} > 0$ e $\text{PreçoPorLitro} > 0$.
  - Entradas inválidas ($\le 0$, `NaN`, `Infinity`) são rejeitadas de forma segura.

### REQ-01 — Cálculo de Consumo Médio pelo Nível do Marcador ("Palitinhos")
- **Descrição:** Como raramente se abastece apenas com tanque vazio ou enchendo até o automático, o usuário informa quantos **"palitinhos"** (segmentos) estavam acesos no marcador do painel **imediatamente antes** de abastecer. O sistema converte esse nível em litros usando a capacidade do tanque ($C_{\text{tanque}}$) e o total de segmentos do painel ($N_{\text{barras}}$) obtidos no cadastro do carro.
- **Formulação Matemática:**
  $$V(b) = V_{\text{reserva\_offset}} + \frac{b}{N_{\text{barras}}} \cdot \left(C_{\text{tanque}} - V_{\text{reserva\_offset}}\right), \quad 0 \le b \le N_{\text{barras}}$$
  Para cada par consecutivo de abastecimentos $(i-1, i)$ ordenados por odômetro:
  - Volume no tanque imediatamente após o abastecimento $i-1$:
    $$V_{\text{após}, i-1} = \begin{cases} C_{\text{tanque}}, & \text{se tanque completado em } i-1 \\ \min\left(C_{\text{tanque}},\, V(b_{i-1}) + L_{i-1}\right), & \text{caso contrário} \end{cases}$$
  - Volume consumido no intervalo $[i-1, i]$:
    $$\Delta V_i = V_{\text{após}, i-1} - V(b_i)$$
  - Distância percorrida e consumo médio do intervalo:
    $$\Delta d_i = \text{Odo}_i - \text{Odo}_{i-1}, \qquad \text{km/L}_i = \frac{\Delta d_i}{\Delta V_i}, \qquad \text{L/100km}_i = \frac{100}{\text{km/L}_i}$$
  - Incerteza de leitura do marcador ($\pm 0{,}5$ palitinho) propagada em $\Delta V_i$ para exibir faixa de confiança quando o abastecimento não foi tanque cheio.
- **Critério de Aceitação:**
  - Deve calcular consumo válido tanto em ciclos de tanque cheio quanto em ciclos parciais por palitinhos;
  - Se $\Delta d_i \le 0$ ou $\Delta V_i \le 0$, o intervalo é sinalizado como inconsistente e excluído das médias estatísticas.

### REQ-02 — Validação Cruzada no Momento do Cadastro do Veículo
- **Descrição:** No momento de cadastrar um carro, o sistema deve consultar uma base de dados pública/curada (integração híbrida com **API pública da Tabela FIPE** + **Catálogo Técnico PBEV/INMETRO e Montadoras**) para preencher automaticamente:
  - Capacidade nominal do tanque (em litros);
  - Quantidade de palitinhos/segmentos do marcador de combustível no painel;
  - Médias oficiais de referência INMETRO (cidade/estrada para Gasolina e Álcool).
- **Validação Cruzada:** Caso o usuário altere manualmente algum valor (ou cadastre um modelo fora da lista), o sistema executa validação cruzada em tempo real:
  - Compara a capacidade do tanque informada com o catálogo de referência (alerta se divergência $> 10\%$, erro se fora dos limites físicos $20\text{ L} \le C_{\text{tanque}} \le 120\text{ L}$);
  - Valida se o número de palitinhos está compatível com a arquitetura do painel do modelo ($4 \le N_{\text{barras}} \le 24$);
  - Retorna `confidenceScore` (0 a 100), status (`VERIFIED`, `ADJUSTED_WARNING`, `UNVERIFIED_CUSTOM`) e mensagens explicativas.
- **Critério de Aceitação:**
  - Cadastro de modelo conhecido preenche automaticamente tanque, palitinhos e médias INMETRO;
  - Divergências significativas entre o digitado e a base pública disparam avisos claros na tela de cadastro antes de salvar.

### REQ-03 — Avaliação Estatística da Qualidade do Consumo e Mini-Alertas
- **Descrição:** A aba de Análises deve avaliar o quão "bom" foi o consumo nos últimos intervalos de abastecimento usando métodos estatísticos formais e emitir **mini-alertas** quando houver **aumento significativo de consumo** (piora de eficiência em L/100km, equivalente a queda em km/L).
- **Métodos Estatísticos Implementados:**
  1. **Métrica linear de consumo específico ($Y_i = \text{L/100km}_i = 100 / \text{km/L}_i$):** Trabalha-se em L/100km para testes paramétricos porque o consumo específico é linear no combustível gasto por distância fixa (distribuição mais próxima da normal e aditiva), exibindo ambos na interface (`km/L` e `L/100km`).
  2. **Média Ponderada pela Distância** ($\bar{C}_{\text{pond}} = \sum \Delta d_i / \sum \Delta V_i$), **Média Histórica ($\mu$)**, **Desvio Padrão Amostral ($s$)**, **Mediana** e **MAD (Median Absolute Deviation)** para robustez contra outliers.
  3. **Teste Z / Teste $t$ de Student Unilateral (Anomalia Aguda no Último Intervalo):**
     Comparamos o último intervalo contra a linha de base histórica anterior ($n_{\text{base}} \ge 3$):
     $$z = \frac{Y_{\text{último}} - \mu_{\text{base}}}{\sigma_{\text{eff}}}, \qquad p\text{-valor} = P(T \ge z)$$
     onde $\sigma_{\text{eff}} = \max(s_{\text{base}},\, \text{MAD\_sigma}_{\text{base}},\, 0{,}04 \cdot \mu_{\text{base}})$ evita falsos positivos quando o histórico tem variância artificialmente próxima de zero. Para $n_{\text{base}} < 30$, o $p$-valor usa a distribuição $t$ de Student com $\nu = n_{\text{base}} - 1$ graus de liberdade.
  4. **EWMA — Média Móvel Exponencialmente Ponderada ($\alpha = 0{,}35$):**
     Detecta degradação gradual nos últimos 2 a 3 intervalos consecutivos antes mesmo de um único pico extremo ocorrer.
  5. **Comparação com Benchmark INMETRO (Cold-Start):** Quando o histórico ainda possui menos de 3 intervalos no combustível, compara o consumo observado com a faixa INMETRO (cidade/estrada) do carro cadastrado.
- **Regras de Mini-Alerta e Classificação:**
  - **Classificação dos Últimos Intervalos:** `EXCELENTE`, `BOM`, `NORMAL`, `ATENÇÃO` ou `CRÍTICO`.
  - **Mini-Alerta Estatístico (`HIGH_CONSUMPTION_SPIKE` / `DEGRADATION_TREND`):** Disparado automaticamente quando:
    - $p\text{-valor unilateral} < 0{,}05$ (aumento estatisticamente significativo de L/100km, equivalente a $z \ge 1{,}645$ assintoticamente ou $t \ge t_{0{,}95, \nu}$), OU
    - Aumento de consumo $> 15\%$ em relação à média histórica / referência INMETRO de cidade, OU
    - Tendência EWMA persistente acima de $\mu_{\text{base}} + 1{,}25 \cdot \sigma_{\text{eff}}$ nos últimos 2+ intervalos.
- **Critério de Aceitação:**
  - Série estável não dispara falso positivo de alerta;
  - Aumento estatisticamente significativo de consumo (ex.: queda de 12 km/L para 8,5 km/L após histórico consistente) dispara o mini-alerta com Z/t-score, $p$-valor e variação percentual.

### REQ-04 — Separação Estrita entre Gasolina (Default) e Álcool + Comparativo
- **Descrição:** No momento do abastecimento, o usuário deve selecionar entre **Gasolina** (selecionada **por padrão / default**) e **Álcool (Etanol)**. Os históricos estatísticos nunca devem misturar consumos de Gasolina com Álcool.
- **Tratamento de Mistura Residual no Tanque:**
  - O combustível atribuído ao intervalo $[i-1, i]$ é o do abastecimento $i-1$.
  - Se antes do abastecimento $i-1$ havia combustível diferente remanescente no tanque representando mais de **20%** do volume total pós-abastecimento, o intervalo é marcado como `isMixedTank: true` (tanque misto/transição) e isolado das estatísticas puras de Gasolina e Álcool.
- **Comparativo Gasolina vs. Álcool:**
  - Na aba de Análises, compara lado a lado: km/L médio de Gasolina vs. Álcool, **Razão Real Etanol/Gasolina** ($\text{km/L}_{\text{Álcool}} / \text{km/L}_{\text{Gasolina}}$ vs. referência de 70% e razão INMETRO do veículo), **Custo por km (R$/km)** de cada combustível, **Preço Máximo de Equilíbrio do Álcool** dado o preço atual da Gasolina e recomendação automática de qual combustível compensa mais.
- **Critério de Aceitação:**
  - O formulário inicia sempre com `GASOLINE` selecionado;
  - Estatísticas de Gasolina consideram exclusivamente intervalos puros de Gasolina; estatísticas de Álcool consideram exclusivamente intervalos puros de Álcool.

### REQ-05 — Desempenho e Portabilidade (App Rápido + Conta Google)
- **Descrição:** O aplicativo deve abrir e responder instantaneamente, sem frameworks pesados de UI ou gráficos bloated.
- **Arquitetura de Performance:**
  - Renderização com React + CSS nativo minimalista + gráficos vetoriais SVG inline (zero bibliotecas pesadas de charting);
  - Persistência *Local-First* síncrona/instantânea em `localStorage`;
  - Empacotamento **PWA + Capacitor** para uso direto como App Android ou no navegador;
  - **Sincronização com Conta Google** via Google Identity Services + Google Drive API (`drive.appdata` / arquivo JSON `fueltracker-backup.json`) e exportação/importação manual em 1 clique.

### REQ-06 — Documentação Viva das Exigências
- **Descrição:** Todas as exigências devem estar formalizadas em arquivo dedicado na raiz do projeto (`/home/gabriel/Documentos/FuelTracker/REQUIREMENTS.md`) para validação e reavaliação contínuas.

### REQ-07 — Testes de Unidade em Pasta Dedicada
- **Descrição:** Todos os testes de unidade devem residir na pasta `/home/gabriel/Documentos/FuelTracker/tests/` e cobrir o motor de cálculo de combustível, a validação cruzada de veículos e o motor estatístico/alertas.

---

## 3. Matriz de Rastreabilidade (Exigência $\rightarrow$ Código $\rightarrow$ Testes)

| ID | Exigência | Módulos Responsáveis | Arquivos de Teste (`tests/`) |
| :--- | :--- | :--- | :--- |
| **REQ-00** | Preço/L + Total $\rightarrow$ Litros auto; gastos mensais | `src/services/fuelCalculator.ts`, `src/services/statisticalEngine.ts`, `src/components/RefuelForm.tsx` | `tests/fuelCalculator.test.ts`, `tests/statisticalEngine.test.ts` |
| **REQ-01** | Consumo médio por palitinhos do marcador | `src/services/fuelCalculator.ts`, `src/data/vehicleSpecsDb.ts` | `tests/fuelCalculator.test.ts` |
| **REQ-02** | Validação cruzada no cadastro do carro (FIPE + Base) | `src/services/vehicleValidator.ts`, `src/data/vehicleSpecsDb.ts`, `src/components/VehicleRegistration.tsx` | `tests/vehicleValidator.test.ts` |
| **REQ-03** | Avaliação estatística e mini-alertas de aumento de consumo | `src/services/statisticalEngine.ts`, `src/components/AnalyticsDashboard.tsx` | `tests/statisticalEngine.test.ts` |
| **REQ-04** | Separação Gasolina (default) vs. Álcool + comparativo | `src/types/index.ts`, `src/services/fuelCalculator.ts`, `src/services/statisticalEngine.ts`, `src/components/RefuelForm.tsx`, `src/components/AnalyticsDashboard.tsx` | `tests/fuelCalculator.test.ts`, `tests/statisticalEngine.test.ts` |
| **REQ-05** | App rápido, Android/Web, Sincronização Google | `src/services/storage.ts`, `src/services/googleSync.ts`, `vite.config.ts`, `capacitor.config.ts` | Build & Bundle verification |
| **REQ-06** | Documento de exigências dedicado | `REQUIREMENTS.md` | Revisão manual e rastreabilidade |
| **REQ-07** | Pasta específica de testes de unidade | `tests/*.test.ts`, `vite.config.ts` | `npm test` (`vitest run`) |
