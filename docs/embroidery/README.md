# Auditoria do leitor de matrizes

Investigação iniciada na branch `codex/embroidery-parser-validation`. Durante a revisão, o projeto foi alterado por outro fluxo e passou para `fix/embroidery-parser-wilcom-parity`. Este relatório descreve a implementação estrita testada anteriormente; a versão atual ainda não está aprovada para fidelidade total.

Após autorização explícita do usuário, a validação estrita foi reaplicada: removidos os valores padrão de unidade, cores e comandos; restauradas as conferências de unidade, limites e tabela de linhas, e os três testes de corrupção. A suíte voltou a 38 testes, todos passando. As alterações concorrentes nas telas de pedidos foram preservadas. A equivalência universal com Wilcom continua pendente das referências descritas abaixo.

## Resultados dos cinco arquivos

Medidas abaixo em milímetros. Os EMB mantêm internamente a precisão completa; a tabela arredonda somente para leitura.

| Arquivo | Wilcom esperado | Motor: pontos | Cores/etapas | Largura × altura (mm) | Evidência |
|---|---|---:|---:|---|---|
| LIDER 007.DST | Texto fornecido: 5.973; 55,6 × 78,4 mm. Print parece indicar 556,0 × 784,0 mm; escala pendente | 5.973 | 5 etapas | 55,6 × 78,4 | ST conferido; movimentos decodificados |
| LIDER 007.EMB | Preview específico pendente | 5.973 | 5 | 55,611111 × 78,316667 | Dicionário, propriedades e conversão interna |
| LIDER020.DST | Preview pendente | 12.564 | 2 etapas | 80,4 × 71,4 | Cabeçalho conferido com comandos |
| LIDER020.EMB | Preview pendente | 12.564 | 2 | 80,472222 × 71,472222 | Dicionário, propriedades e conversão interna |
| LIDER016manga.EMB | Preview pendente | 5.504 | 2 | 70,644444 × 42,244444 | Dicionário, propriedades e conversão interna |

O Windows Shell consultado neste PC não forneceu propriedades de bordado; a consulta está registrada em `windows-shell.json`. A comparação com Preview/Wilcom dos demais arquivos continua pendente. O print e o texto de referência divergem em um fator dez nas medidas; nenhum fator artificial foi aplicado ao motor.

## Correções e decisões

- DST: máscaras completas distinguem ponto, salto, troca, modo sequin e fim. Conta todos os registros e confere ST, CO e limites declarados com os movimentos. O DST 007 declara altura 78,2 mm, mas os movimentos codificam 78,4 mm. Usa os movimentos nesse caso. ST nos arquivos fornecidos inclui o comando final. Cabeçalhos consistentes de outros escritores podem excluir esse comando.
- DST registra etapas de cor, não a identidade das linhas nem cores únicas. Stops e trims não possuem comandos exclusivos; o diagnóstico deixa esses valores desconhecidos e separa candidatos a corte inferidos de sequências de saltos.
- EMB: leitor OLE com limites e detecção de ciclos, tabela de propriedades validada, resolução pelo dicionário de nomes em vez de IDs fixos. Extrai a conversão mm/unidade da propriedade `unit conversion info` e confere a relação entre mm e polegadas. Confere dimensões contra limites internos e cores contra a tabela de linhas. Enumera versões estruturadas de criação e destino. Não usa busca binária solta nem contagem de `.Default`.
- A soma de pontos por linha pode excluir comandos de controle. Não foi assumido que a diferença equivale a stops, pois o EMB 007 prova que essa igualdade não é geral.
- Interface: valores iniciais removidos, campos vazios durante leitura, falhas bloqueiam salvamento, lote entregue somente depois de todos os arquivos passarem. Dados extraídos permanecem somente para leitura, e a origem dos valores é exibida e armazenada em `matrix_versions.notes`.
- Pedido: cada item mantém seu próprio arquivo e metadados. Salva todas as matrizes importadas com seus respectivos pontos, cores e dimensões, e vincula cada item ao registro correto. Rascunhos não podem salvar arquivos que se perderam durante serialização sem anexá-los novamente.

## Verificação reproduzível

- `npm test`: 38 testes do motor, arquivos reais, cabeçalhos inconsistentes, truncamentos, comandos sequin, tipos/offsets corrompidos, ciclos OLE, extensão errada, IDs remapeados e comparação byte a byte dos streams com a biblioteca CFB independente.
- `npm run test:embroidery:browser`: testes das telas reais com autenticação, clientes, banco e armazenamento simulados. Nenhum pedido real ou mensagem externa é criado. Verifica campos vazios, precisão enviada para salvamento, bloqueio de lote inválido, quatro matrizes com vínculos separados e leitura pendente.
- `npm run typecheck`: verificação de tipos de toda a aplicação.
- `npm run lint`: regras estritas do motor e componentes de bordado, além das telas modificadas com tolerância aos tipos `any` legados. Não é uma auditoria de lint de todo o código legado.
- `npm run build`: compilação da aplicação. Avisos existentes sobre tamanho de pacote e importação de sonner não invalidam a compilação.
- `npm run diagnose:embroidery`: gera `diagnostics.json` com assinaturas, hashes, streams, propriedades, versões, cabeçalhos, comandos e fontes.
- `scripts/read-windows-embroidery-properties.ps1`: repete a consulta ao Windows Shell.

Fixtures são cópias dos cinco originais, preservados em Downloads. Não foram realizados push, merge ou publicação. Mudanças concorrentes em outras telas de pedidos foram preservadas e ficam fora do commit desta investigação.

## Referências do formato

- [Leitor Tajima de pyembroidery](https://github.com/EmbroidePy/pyembroidery/blob/main/pyembroidery/DstReader.py)
- [Microsoft MS-CFB](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/50708a61-81d9-49c8-ab9c-43c98a795242)
- [Microsoft MS-OLEPS DictionaryEntry](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/333959a3-a999-4eca-8627-48a224e63e77)

Para afirmar equivalência ao Wilcom em qualquer formato, é necessário ampliar fixtures e versões, resolver a referência de escala e integrar um motor oficial para os formatos proprietários sem metadados comprovados. O comportamento atual prioriza falha explícita a resultados inventados.
