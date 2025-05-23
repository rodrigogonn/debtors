const fs = require('fs');
const inquirer = require('inquirer');
const prompt = inquirer.createPromptModule();
const { DateTime } = require('luxon');

// Códigos de cores ANSI
const cores = {
  reset: '\x1b[0m',
  verde: '\x1b[32m',
  vermelho: '\x1b[31m',
  amarelo: '\x1b[33m',
};

// Funções utilitárias
const lerDados = () => {
  try {
    const conteudo = fs.readFileSync('dados.json', 'utf-8');
    return JSON.parse(conteudo || '{"devedores": []}');
  } catch (error) {
    console.error('Erro ao ler o arquivo JSON. Criando um novo arquivo.');
    return { devedores: [] };
  }
};

const salvarDados = (dados) => {
  fs.writeFileSync('dados.json', JSON.stringify(dados, null, 2));
};

// Funções auxiliares para formatação de data
function formatarData(data) {
  if (!data) return '';

  // Se for um objeto Date, converte para string ISO
  if (data instanceof Date) {
    data = data.toISOString().split('T')[0];
  }

  // Agora garante que data é uma string no formato YYYY-MM-DD
  const [ano, mes, dia] = data.toString().split('-');
  return `${dia}/${mes}/${ano}`;
}

function converterDataParaISO(data) {
  const [dia, mes, ano] = data.split('/');
  return `${ano}-${mes}-${dia}`;
}

// Atualizar função de validação de data
function validarData(data) {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(data)) return false;

  const [dia, mes, ano] = data.split('/');
  const dataObj = DateTime.fromObject({
    day: parseInt(dia),
    month: parseInt(mes),
    year: parseInt(ano),
  });

  return (
    dataObj.isValid &&
    dataObj.day === parseInt(dia) &&
    dataObj.month === parseInt(mes) &&
    dataObj.year === parseInt(ano)
  );
}

// Atualiza o histórico de uma dívida com juros em tempo real
function atualizarHistorico(divida) {
  const hoje = new Date();
  let valorAtual = 0;
  const historicoAtualizado = [];

  // Ordena o histórico original por data
  const historicoOrdenado = [...divida.historico].sort(
    (a, b) => new Date(a.data) - new Date(b.data)
  );

  // Inicializa o histórico de juros se não existir
  if (!divida.historicoJuros) {
    divida.historicoJuros = [
      {
        data: divida.dataCriacao,
        valor: divida.jurosMensais || 0,
      },
    ];
  }

  // Ordena o histórico de juros por data
  const historicoJurosOrdenado = [...divida.historicoJuros].sort(
    (a, b) => new Date(a.data) - new Date(b.data)
  );

  // Pega a data inicial e o dia dos juros
  const dataInicial = new Date(divida.dataCriacao);
  let dataJuros = new Date(dataInicial);

  let mesesAdicionados = 0;
  let jurosAtual = historicoJurosOrdenado[0].valor;
  let proximoJuros = historicoJurosOrdenado[1];

  // Processa o histórico em ordem cronológica
  historicoOrdenado.forEach((evento) => {
    // Verifica se precisa mudar o juros antes de adicionar o evento
    if (proximoJuros && new Date(evento.data) >= new Date(proximoJuros.data)) {
      jurosAtual = proximoJuros.valor;
      proximoJuros =
        historicoJurosOrdenado[
          historicoJurosOrdenado.indexOf(proximoJuros) + 1
        ];
    }

    // Adiciona o evento
    historicoAtualizado.push({
      data: evento.data,
      descricao: evento.descricao,
      valor: evento.valor,
    });
    valorAtual += evento.valor;

    // Se for o primeiro evento e tiver juros, cobra imediatamente
    if (evento === historicoOrdenado[0] && jurosAtual > 0) {
      const jurosInicial = valorAtual * (jurosAtual / 100);
      if (jurosInicial > 0) {
        historicoAtualizado.push({
          data: evento.data,
          descricao: `Juros (${jurosAtual}% de ${formatarMoeda(valorAtual)})`,
          valor: jurosInicial,
        });
        valorAtual += jurosInicial;
      }
      // Avança para o próximo mês, calculando a partir da data inicial
      dataJuros = DateTime.fromJSDate(dataInicial)
        .plus({ months: ++mesesAdicionados })
        .toJSDate();
    }
  });

  // Se não tem juros mensais, retorna o histórico
  if (!jurosAtual || jurosAtual === 0) {
    return historicoAtualizado;
  }

  // Adiciona juros mensais até hoje
  while (dataJuros <= hoje) {
    // Verifica se precisa mudar o juros
    if (proximoJuros && dataJuros >= new Date(proximoJuros.data)) {
      jurosAtual = proximoJuros.valor;
      proximoJuros =
        historicoJurosOrdenado[
          historicoJurosOrdenado.indexOf(proximoJuros) + 1
        ];
    }

    // Calcula o valor atual até a data dos juros
    const valorParaJuros = historicoAtualizado
      .filter((evento) => new Date(evento.data) <= dataJuros)
      .reduce((sum, evento) => sum + evento.valor, 0);

    const juros = valorParaJuros * (jurosAtual / 100);
    if (juros > 0) {
      historicoAtualizado.push({
        data: dataJuros.toISOString().split('T')[0],
        descricao: `Juros (${jurosAtual}% de ${formatarMoeda(valorParaJuros)})`,
        valor: juros,
      });
      valorAtual += juros;
    }
    dataJuros = DateTime.fromJSDate(dataInicial)
      .plus({ months: ++mesesAdicionados })
      .toJSDate();
  }

  // Ordena o histórico final por data
  return historicoAtualizado.sort(
    (a, b) => new Date(a.data) - new Date(b.data)
  );
}

// Menu principal
async function menuPrincipal() {
  const { opcao } = await prompt([
    {
      type: 'list',
      name: 'opcao',
      message: 'Selecione uma opção:',
      choices: [
        'Ver todos os devedores',
        'Adicionar nova dívida',
        'Alterar uma dívida',
        'Registrar um pagamento',
        'Sair',
      ],
    },
  ]);

  const dados = lerDados();

  switch (opcao) {
    case 'Ver todos os devedores':
      await listarDevedores(dados);
      break;
    case 'Adicionar nova dívida':
      await adicionarDivida(dados);
      break;
    case 'Alterar uma dívida':
      await alterarDivida(dados);
      break;
    case 'Registrar um pagamento':
      await registrarPagamento(dados);
      break;
    case 'Sair':
      console.log('Encerrando...');
      process.exit(0);
  }
}

// Função auxiliar para calcular total de todos os devedores
function calcularTotalGeral(dados) {
  return dados.devedores.reduce((total, devedor) => {
    return (
      total +
      devedor.dividas.reduce((subtotal, divida) => {
        const { valorFinal } = calcularDividaAtualizada(divida);
        return subtotal + valorFinal;
      }, 0)
    );
  }, 0);
}

// Função auxiliar para formatar a exibição de uma dívida com o valor total
function formatarDividaComTotal(divida) {
  const { valorFinal } = calcularDividaAtualizada(divida);

  // Inicializa o histórico de juros se não existir
  if (!divida.historicoJuros) {
    divida.historicoJuros = [
      {
        data: divida.dataCriacao,
        valor: divida.jurosMensais || 0,
      },
    ];
  }

  const jurosAtual =
    divida.historicoJuros[divida.historicoJuros.length - 1].valor;
  const jurosInfo = jurosAtual > 0 ? ` (${jurosAtual}%)` : '';
  return `${divida.id} - ${divida.descricao} (Total: ${formatarMoeda(
    valorFinal
  )})${jurosInfo}`;
}

// Função auxiliar para ordenar dívidas da maior para a menor
function ordenarDividasPorValor(dividas) {
  return dividas.sort((a, b) => {
    const valorA = calcularDividaAtualizada(a).valorFinal;
    const valorB = calcularDividaAtualizada(b).valorFinal;
    return valorB - valorA;
  });
}

// Função auxiliar para ordenar devedores do que mais deve para o que menos deve
function ordenarDevedoresPorTotal(dados) {
  return dados.devedores.sort((a, b) => {
    const totalA = a.dividas.reduce(
      (sum, divida) => sum + calcularDividaAtualizada(divida).valorFinal,
      0
    );
    const totalB = b.dividas.reduce(
      (sum, divida) => sum + calcularDividaAtualizada(divida).valorFinal,
      0
    );
    return totalB - totalA;
  });
}

// Listar todos os devedores
async function listarDevedores(dados) {
  if (dados.devedores.length === 0) {
    console.log('Nenhum devedor cadastrado.');
    return await menuPrincipal();
  }

  // Ordena devedores por total devido
  const devedoresOrdenados = ordenarDevedoresPorTotal(dados);

  const totalGeral = calcularTotalGeral(dados);
  console.log(`\nTotal geral devido: ${formatarMoeda(totalGeral)}`);

  const devedoresComTotal = devedoresOrdenados
    .map((devedor) => {
      const dividasAtivas = ordenarDividasPorValor(
        devedor.dividas.filter((div) => !div.quitada)
      );
      const totalDevedor = dividasAtivas.reduce((sum, divida) => {
        const { valorFinal } = calcularDividaAtualizada(divida);
        return sum + valorFinal;
      }, 0);

      return {
        nome: devedor.nome,
        total: totalDevedor,
        temDividasAtivas: dividasAtivas.length > 0,
      };
    })
    .filter((d) => d.temDividasAtivas);

  const opcoes = [
    'Voltar ao menu principal',
    ...devedoresComTotal.map(
      (d) => `${d.nome} (Total: ${formatarMoeda(d.total)})`
    ),
  ];

  const { escolha } = await prompt([
    {
      type: 'list',
      name: 'escolha',
      message: 'Selecione um devedor:',
      choices: opcoes,
    },
  ]);

  if (escolha === 'Voltar ao menu principal') {
    return await menuPrincipal();
  }

  const nomeDevedor = escolha.split(' (Total')[0];
  const devedorSelecionado = dados.devedores.find(
    (d) => d.nome === nomeDevedor
  );

  await exibirDividasDevedor(devedorSelecionado, dados);
}

async function exibirDividasDevedor(devedorSelecionado, dados) {
  const { divida } = await prompt([
    {
      type: 'list',
      name: 'divida',
      message: 'Selecione uma dívida:',
      choices: [
        'Voltar',
        ...ordenarDividasPorValor(
          devedorSelecionado.dividas.filter((d) => !d.quitada)
        ).map(formatarDividaComTotal),
      ],
    },
  ]);

  if (divida === 'Voltar') {
    return await listarDevedores(dados);
  }

  const dividaId = parseInt(divida.split(' - ')[0]);
  const dividaSelecionada = devedorSelecionado.dividas.find(
    (d) => d.id === dividaId
  );
  const { historicoCompleto, valorFinal } =
    calcularDividaAtualizada(dividaSelecionada);

  exibirDetalheDivida(dividaSelecionada, historicoCompleto);

  console.log('\nPressione Enter para continuar...');
  await prompt([{ type: 'input', name: 'continue', message: '' }]);
  await exibirDividasDevedor(devedorSelecionado, dados);
}

// Função auxiliar para validar valores monetários
const validarValorMonetario = {
  type: 'input',
  validate: (input) => {
    const valor = parseFloat(input.replace(',', '.'));
    if (isNaN(valor)) return 'Por favor, digite um número válido';
    return true;
  },
  filter: (input) => parseFloat(input.replace(',', '.')),
};

// Adicionar nova dívida (versão atualizada)
async function adicionarDivida(dados) {
  const devedoresExistentes = [
    'Criar novo devedor',
    ...dados.devedores.map((d) => d.nome),
  ];

  const { escolhaDevedor } = await prompt([
    {
      type: 'list',
      name: 'escolhaDevedor',
      message: 'Selecione um devedor ou crie um novo:',
      choices: [...devedoresExistentes, 'Voltar'],
    },
  ]);

  if (escolhaDevedor === 'Voltar') {
    return await menuPrincipal();
  }

  let nome = escolhaDevedor;
  if (escolhaDevedor === 'Criar novo devedor') {
    const { novoNome } = await prompt([
      { type: 'input', name: 'novoNome', message: 'Nome do novo devedor:' },
    ]);
    nome = novoNome;
  }

  // Escolher tipo de dívida
  const { tipoDivida } = await prompt([
    {
      type: 'list',
      name: 'tipoDivida',
      message: 'Que tipo de dívida deseja criar?',
      choices: ['Dívida normal', 'Dívida parcelada', 'Voltar'],
    },
  ]);

  if (tipoDivida === 'Voltar') {
    return await menuPrincipal();
  }

  // Campos comuns para ambos os tipos
  const dataCriacao = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
  const { descricao, jurosMensais, observacao } = await prompt([
    { type: 'input', name: 'descricao', message: 'Descrição da dívida:' },
    {
      ...validarValorMonetario,
      name: 'jurosMensais',
      message: 'Juros mensais (%):',
      default: '0',
    },
    { type: 'input', name: 'observacao', message: 'Observações (opcional):' },
  ]);

  let valorInicial, dataInicial, parcelamento;

  if (tipoDivida === 'Dívida normal') {
    const respostas = await prompt([
      {
        ...validarValorMonetario,
        name: 'valorInicial',
        message: 'Valor inicial:',
      },
      {
        type: 'input',
        name: 'dataInicial',
        message: 'Data inicial (DD/MM/YYYY):',
      },
    ]);
    valorInicial = respostas.valorInicial;
    dataInicial = respostas.dataInicial;
  } else {
    // Campos específicos para dívida parcelada
    const respostas = await prompt([
      {
        type: 'number',
        name: 'totalParcelas',
        message: 'Número total de parcelas:',
      },
      {
        ...validarValorMonetario,
        name: 'valor_parcela',
        message: 'Valor de cada parcela:',
      },
      {
        type: 'number',
        name: 'dia_vencimento',
        message: 'Dia do vencimento (1-31):',
      },
      {
        type: 'input',
        name: 'data_inicio',
        message: 'Data do primeiro vencimento (DD/MM/YYYY):',
      },
    ]);

    if (!validarData(respostas.data_inicio)) {
      console.log('Data inválida! Use o formato DD/MM/YYYY');
      return await menuPrincipal();
    }

    if (respostas.dia_vencimento < 1 || respostas.dia_vencimento > 31) {
      console.log('Dia de vencimento inválido! Use um número entre 1 e 31.');
      return await menuPrincipal();
    }

    dataInicial = respostas.data_inicio;
    parcelamento = {
      valorParcela: respostas.valor_parcela,
      diaVencimento: respostas.dia_vencimento,
      totalParcelas: respostas.totalParcelas,
      inicioVencimentos: converterDataParaISO(respostas.data_inicio),
    };
  }

  if (tipoDivida === 'Dívida normal' && !validarData(dataInicial)) {
    console.log('Data inválida! Use o formato DD/MM/YYYY');
    return await menuPrincipal();
  }

  let devedor = dados.devedores.find((d) => d.nome === nome);
  if (!devedor) {
    devedor = { nome, dividas: [] };
    dados.devedores.push(devedor);
  }

  const novaDivida = {
    id: devedor.dividas.length + 1,
    descricao,
    jurosMensais,
    observacao: observacao || '',
    dataCriacao,
    historico:
      tipoDivida === 'Dívida normal'
        ? [
            {
              data: converterDataParaISO(dataInicial),
              descricao: 'Valor inicial',
              valor: valorInicial,
            },
          ]
        : [],
    ...(parcelamento && { parcelamento }),
    historicoJuros: [
      {
        data: dataCriacao,
        valor: jurosMensais,
      },
    ],
  };

  devedor.dividas.push(novaDivida);
  salvarDados(dados);
  console.log('Dívida adicionada com sucesso!');
  await menuPrincipal();
}

// Registrar pagamento
async function registrarPagamento(dados) {
  if (dados.devedores.length === 0) {
    console.log('Nenhum devedor cadastrado.');
    return await menuPrincipal();
  }

  // Ordena devedores por total devido
  const devedoresOrdenados = ordenarDevedoresPorTotal(dados);

  const escolhasDevedores = devedoresOrdenados.map((devedor) => {
    const totalDevedor = devedor.dividas.reduce((sum, divida) => {
      const { valorFinal } = calcularDividaAtualizada(divida);
      return sum + valorFinal;
    }, 0);
    return `${devedor.nome} (Total: ${formatarMoeda(totalDevedor)})`;
  });

  const { devedorEscolha } = await prompt([
    {
      type: 'list',
      name: 'devedorEscolha',
      message: 'Selecione um devedor:',
      choices: ['Voltar', ...escolhasDevedores],
    },
  ]);

  if (devedorEscolha === 'Voltar') {
    return await menuPrincipal();
  }

  const nomeDevedor = devedorEscolha.split(' (Total')[0];
  const devedorSelecionado = dados.devedores.find(
    (d) => d.nome === nomeDevedor
  );

  const dividasAtivas = ordenarDividasPorValor(
    devedorSelecionado.dividas.filter((d) => !d.quitada)
  );

  if (dividasAtivas.length === 0) {
    console.log('Este devedor não possui dívidas ativas.');
    return await menuPrincipal();
  }

  const escolhasDividas = dividasAtivas.map(formatarDividaComTotal);

  const { dividaEscolha } = await prompt([
    {
      type: 'list',
      name: 'dividaEscolha',
      message: 'Selecione uma dívida:',
      choices: ['Voltar', ...escolhasDividas],
    },
  ]);

  if (dividaEscolha === 'Voltar') {
    return await menuPrincipal();
  }

  const dividaId = parseInt(dividaEscolha.split(' - ')[0]);
  const dividaSelecionada = devedorSelecionado.dividas.find(
    (d) => d.id === dividaId
  );

  // Calcula valor máximo que pode ser pago
  let valorMaximo;
  if (dividaSelecionada.parcelamento) {
    const valorTotal =
      dividaSelecionada.parcelamento.valorParcela *
      dividaSelecionada.parcelamento.totalParcelas;
    const pagamentosRealizados = dividaSelecionada.historico
      .filter((h) => h.valor < 0)
      .reduce((sum, h) => sum + Math.abs(h.valor), 0);
    valorMaximo = valorTotal - pagamentosRealizados;
  } else {
    const { valorFinal } = calcularDividaAtualizada(dividaSelecionada);
    valorMaximo = valorFinal;
  }

  console.log(
    `\nValor máximo que pode ser pago: ${formatarMoeda(valorMaximo)}`
  );

  const { valor, descricao, data } = await prompt([
    {
      ...validarValorMonetario,
      name: 'valor',
      message: 'Valor pago:',
      validate: (input) => {
        const valor = parseFloat(input.replace(',', '.'));
        if (isNaN(valor)) return 'Por favor, digite um número válido';
        if (valor <= 0) return 'O valor deve ser maior que zero';
        if (valor > valorMaximo)
          return `O valor não pode ser maior que ${formatarMoeda(valorMaximo)}`;
        return true;
      },
    },
    {
      type: 'input',
      name: 'descricao',
      message: 'Descrição do pagamento:',
    },
    { type: 'input', name: 'data', message: 'Data do pagamento (DD/MM/YYYY):' },
  ]);

  if (!validarData(data)) {
    console.log('Data inválida! Use o formato DD/MM/YYYY');
    return await menuPrincipal();
  }

  dividaSelecionada.historico.push({
    data: converterDataParaISO(data),
    descricao: descricao || 'Pagamento recebido',
    valor: -valor,
  });

  salvarDados(dados);
  console.log('Pagamento registrado com sucesso!');
  await menuPrincipal();
}

// Adicionar função que está faltando
async function alterarDivida(dados) {
  if (dados.devedores.length === 0) {
    console.log('Nenhum devedor cadastrado.');
    return await menuPrincipal();
  }

  // Ordena devedores por total devido
  const devedoresOrdenados = ordenarDevedoresPorTotal(dados);

  const escolhasDevedores = devedoresOrdenados.map((devedor) => {
    const totalDevedor = devedor.dividas.reduce((sum, divida) => {
      const { valorFinal } = calcularDividaAtualizada(divida);
      return sum + valorFinal;
    }, 0);
    return `${devedor.nome} (Total: ${formatarMoeda(totalDevedor)})`;
  });

  const { devedorEscolha } = await prompt([
    {
      type: 'list',
      name: 'devedorEscolha',
      message: 'Selecione um devedor:',
      choices: ['Voltar', ...escolhasDevedores],
    },
  ]);

  if (devedorEscolha === 'Voltar') {
    return await menuPrincipal();
  }

  const nomeDevedor = devedorEscolha.split(' (Total')[0];
  const devedorSelecionado = dados.devedores.find(
    (d) => d.nome === nomeDevedor
  );

  const escolhasDividas = ordenarDividasPorValor(
    devedorSelecionado.dividas
  ).map(formatarDividaComTotal);

  const { dividaEscolha } = await prompt([
    {
      type: 'list',
      name: 'dividaEscolha',
      message: 'Selecione uma dívida:',
      choices: ['Voltar', ...escolhasDividas],
    },
  ]);

  if (dividaEscolha === 'Voltar') {
    return await alterarDivida(dados);
  }

  const dividaId = parseInt(dividaEscolha.split(' - ')[0]);
  const dividaSelecionada = devedorSelecionado.dividas.find(
    (d) => d.id === dividaId
  );

  const opcoes = [
    'Voltar',
    'Descrição',
    'Gerenciar juros',
    'Gerenciar histórico',
  ];

  // Adiciona opções de parcelamento se a dívida tiver parcelamento
  if (dividaSelecionada.parcelamento) {
    opcoes.push(
      'Valor da parcela',
      'Dia do vencimento',
      'Total de parcelas',
      'Data início vencimentos'
    );
  }

  const { campo } = await prompt([
    {
      type: 'list',
      name: 'campo',
      message: 'Qual campo deseja alterar?',
      choices: opcoes,
    },
  ]);

  if (campo === 'Voltar') {
    return await menuPrincipal();
  }

  if (campo === 'Gerenciar juros') {
    return await gerenciarJuros(dados, dividaSelecionada);
  }

  if (campo === 'Gerenciar histórico') {
    return await gerenciarHistorico(dados, dividaSelecionada);
  }

  const { novoValor } = await prompt([
    {
      type: 'input',
      name: 'novoValor',
      message: `Digite o novo ${campo.toLowerCase()}:`,
    },
  ]);

  switch (campo) {
    case 'Juros mensais':
      dividaSelecionada.jurosMensais = Number(novoValor);
      break;
    case 'Descrição':
      dividaSelecionada.descricao = novoValor;
      break;
    case 'Valor da parcela':
      dividaSelecionada.parcelamento.valorParcela = Number(novoValor);
      break;
    case 'Dia do vencimento':
      const dia = Number(novoValor);
      if (dia < 1 || dia > 31) {
        console.log('Dia inválido! Use um número entre 1 e 31.');
        return await alterarDivida(
          dados,
          devedorSelecionado,
          dividaSelecionada
        );
      }
      dividaSelecionada.parcelamento.diaVencimento = dia;
      break;
    case 'Total de parcelas':
      dividaSelecionada.parcelamento.totalParcelas = Number(novoValor);
      break;
    case 'Data início vencimentos':
      if (!validarData(novoValor)) {
        console.log('Data inválida! Use o formato DD/MM/YYYY');
        return await alterarDivida(
          dados,
          devedorSelecionado,
          dividaSelecionada
        );
      }
      dividaSelecionada.parcelamento.inicioVencimentos =
        converterDataParaISO(novoValor);
      break;
  }

  salvarDados(dados);
  console.log('Dívida alterada com sucesso!');
  await menuPrincipal();
}

async function gerenciarHistorico(dados, divida) {
  while (true) {
    console.log('\nHistórico atual:');
    divida.historico.forEach((evento, index) => {
      const valor = evento.valor < 0 ? cores.verde : cores.vermelho;
      console.log(
        `${index + 1}. ${valor}${
          evento.valor < 0 ? '-' : '+'
        }R$ ${formatarNumero(Math.abs(evento.valor)).padStart(11)} - ${
          evento.descricao
        } (${formatarData(evento.data)})${cores.reset}`
      );
    });

    const { acao } = await prompt([
      {
        type: 'list',
        name: 'acao',
        message: 'O que deseja fazer?',
        choices: ['Voltar', 'Remover item', 'Alterar item', 'Adicionar item'],
      },
    ]);

    if (acao === 'Voltar') {
      return await alterarDivida(dados);
    }

    if (acao === 'Remover item') {
      const { itemIndex } = await prompt([
        {
          type: 'number',
          name: 'itemIndex',
          message: 'Digite o número do item que deseja remover:',
          validate: (input) => {
            if (input < 1 || input > divida.historico.length) {
              return 'Número inválido';
            }
            return true;
          },
        },
      ]);

      divida.historico.splice(itemIndex - 1, 1);
      console.log('Item removido com sucesso!');
    }

    if (acao === 'Alterar item') {
      const { itemIndex } = await prompt([
        {
          type: 'number',
          name: 'itemIndex',
          message: 'Digite o número do item que deseja alterar:',
          validate: (input) => {
            if (input < 1 || input > divida.historico.length) {
              return 'Número inválido';
            }
            return true;
          },
        },
      ]);

      const item = divida.historico[itemIndex - 1];
      const { campo } = await prompt([
        {
          type: 'list',
          name: 'campo',
          message: 'Qual campo deseja alterar?',
          choices: ['Valor', 'Descrição', 'Data'],
        },
      ]);

      if (campo === 'Valor') {
        const { novoValor } = await prompt([
          {
            ...validarValorMonetario,
            name: 'novoValor',
            message:
              'Digite o novo valor (positivo para cobrança, negativo para pagamento):',
          },
        ]);
        item.valor = novoValor;
      } else if (campo === 'Descrição') {
        const { novaDescricao } = await prompt([
          {
            type: 'input',
            name: 'novaDescricao',
            message: 'Digite a nova descrição:',
          },
        ]);
        item.descricao = novaDescricao;
      } else if (campo === 'Data') {
        const { novaData } = await prompt([
          {
            type: 'input',
            name: 'novaData',
            message: 'Digite a nova data (DD/MM/YYYY):',
          },
        ]);

        if (!validarData(novaData)) {
          console.log('Data inválida! Use o formato DD/MM/YYYY');
          continue;
        }
        item.data = converterDataParaISO(novaData);
      }

      console.log('Item alterado com sucesso!');
    }

    if (acao === 'Adicionar item') {
      const { valor, descricao, data } = await prompt([
        {
          type: 'number',
          name: 'valor',
          message: 'Valor (positivo para cobrança, negativo para pagamento):',
        },
        {
          type: 'input',
          name: 'descricao',
          message: 'Descrição:',
        },
        {
          type: 'input',
          name: 'data',
          message: 'Data (DD/MM/YYYY):',
        },
      ]);

      if (!validarData(data)) {
        console.log('Data inválida! Use o formato DD/MM/YYYY');
        continue;
      }

      divida.historico.push({
        data: converterDataParaISO(data),
        descricao,
        valor,
      });

      console.log('Item adicionado com sucesso!');
    }

    salvarDados(dados);
  }
}

function calcularDividaAtualizada(divida) {
  if (divida.parcelamento) {
    const valorTotal =
      divida.parcelamento.valorParcela * divida.parcelamento.totalParcelas;
    const valorPago = divida.historico
      .filter((h) => h.valor < 0)
      .reduce((sum, h) => sum + Math.abs(h.valor), 0);

    const valorFinal = valorTotal - valorPago;
    divida.quitada = Math.abs(valorFinal) < 0.01;

    return {
      historicoCompleto: divida.historico,
      valorFinal,
    };
  }

  // Para dívidas não parceladas, mantém o cálculo original
  const historicoCompleto = atualizarHistorico(divida);
  const valorFinal = historicoCompleto.reduce(
    (sum, evento) => sum + evento.valor,
    0
  );

  divida.quitada = Math.abs(valorFinal) < 0.01;

  return {
    historicoCompleto,
    valorFinal,
  };
}

// Função auxiliar para formatar números
function formatarNumero(numero) {
  return numero
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Manter a função original para casos onde não queremos cor/alinhamento
function formatarMoeda(valor) {
  return `${cores.amarelo}R$ ${formatarNumero(valor)}${cores.reset}`;
}

function calcularStatusParcela(divida) {
  if (!divida.parcelamento) return null;

  const hoje = DateTime.now();
  const inicioVencimentos = DateTime.fromISO(
    divida.parcelamento.inicioVencimentos
  );

  let parcelaAtual = 1;
  let dataVencimento = inicioVencimentos;

  // Calcula o total pago
  const totalPago = divida.historico
    .filter((h) => h.valor < 0)
    .reduce((sum, h) => sum + Math.abs(h.valor), 0);

  const valorParcela = divida.parcelamento.valorParcela;

  // Calcula quantas parcelas já deveriam ter sido pagas
  while (dataVencimento <= hoje) {
    if (totalPago < parcelaAtual * valorParcela) {
      break;
    }
    parcelaAtual++;
    dataVencimento = dataVencimento.plus({ months: 1 });
  }

  // Ajusta para não ultrapassar o total de parcelas
  parcelaAtual = Math.min(parcelaAtual, divida.parcelamento.totalParcelas);

  // Determina o status baseado no vencimento e pagamento
  let status;
  const valorRestanteParcela = parcelaAtual * valorParcela - totalPago;
  if (valorRestanteParcela > 0 && dataVencimento <= hoje) {
    status = 'ATRASADA';
  } else if (dataVencimento > hoje) {
    status = 'EM_ABERTO';
  } else {
    status = 'EM_DIA';
  }

  return {
    parcelaAtual,
    totalParcelas: divida.parcelamento.totalParcelas,
    valorParcela,
    valorPago: totalPago,
    pagamentosParcela: totalPago - (parcelaAtual - 1) * valorParcela,
    vencimento: dataVencimento.toISODate(),
    status,
  };
}

function exibirDetalheDivida(divida) {
  const { historicoCompleto, valorFinal } = calcularDividaAtualizada(divida);
  const statusQuitada = divida.quitada
    ? `${cores.verde}[QUITADA]${cores.reset} `
    : '';

  console.log(`\nDetalhes da dívida: ${statusQuitada}`);
  console.log(`Descrição: ${divida.descricao}`);
  if (divida.observacao) {
    console.log(`Observação: ${divida.observacao}`);
  }

  // Inicializa o histórico de juros se não existir
  if (!divida.historicoJuros) {
    divida.historicoJuros = [
      {
        data: divida.dataCriacao,
        valor: divida.jurosMensais || 0,
      },
    ];
  }

  const jurosAtual =
    divida.historicoJuros[divida.historicoJuros.length - 1].valor;
  if (jurosAtual > 0) {
    console.log(`Juros mensais: ${jurosAtual}%`);
  }

  if (divida.parcelamento) {
    const status = calcularStatusParcela(divida);
    const valorTotal =
      divida.parcelamento.valorParcela * divida.parcelamento.totalParcelas;
    const valorRestante = valorTotal - status.valorPago;

    console.log('\nDetalhes do parcelamento:');
    console.log(`Valor total: ${formatarMoeda(valorTotal)}`);
    console.log(`Valor pago: ${formatarMoeda(status.valorPago)}`);
    console.log(`Valor restante: ${formatarMoeda(valorRestante)}`);

    console.log(
      `\nParcela atual: ${status.parcelaAtual} de ${status.totalParcelas}`
    );
    console.log(`Vencimento: ${formatarData(status.vencimento)}`);
    const valorRestanteParcela = status.valorParcela - status.pagamentosParcela;
    console.log(
      `Valor restante da parcela: ${formatarMoeda(valorRestanteParcela)}`
    );

    const statusCor = {
      ATRASADA: cores.vermelho,
      EM_ABERTO: cores.amarelo,
      EM_DIA: cores.verde,
    };
    console.log(
      `Status: ${statusCor[status.status]}${status.status}${cores.reset}`
    );
  }

  // Chama a função para exibir o histórico
  exibirHistorico(historicoCompleto);

  console.log(`\nValor total da dívida: ${formatarMoeda(valorFinal)}`);

  // Calcular próxima data de cobrança de juros e valor
  if (jurosAtual > 0) {
    const hoje = DateTime.now();
    const dataCriacao = DateTime.fromISO(divida.dataCriacao);
    let proximaDataJuros = hoje.set({ day: dataCriacao.day });

    // Se a próxima data de juros calculada já passou, ajusta para o próximo mês
    if (proximaDataJuros <= hoje) {
      proximaDataJuros = proximaDataJuros.plus({ months: 1 });
    }

    const valorAtual = historicoCompleto.reduce(
      (sum, evento) => sum + evento.valor,
      0
    );
    const valorJuros = valorAtual * (jurosAtual / 100);

    console.log(
      `\nPróximo juros: ${formatarMoeda(valorJuros)} em ${formatarData(
        proximaDataJuros.toJSDate()
      )}`
    );
  }
}

function exibirHistorico(historico) {
  console.log('\nHistórico:');
  historico.forEach((evento) => {
    const valor = evento.valor < 0 ? cores.verde : cores.vermelho;
    console.log(
      `${valor}${evento.valor < 0 ? '-' : '+'}R$ ${formatarNumero(
        Math.abs(evento.valor)
      ).padStart(11)} - ${evento.descricao} (${formatarData(evento.data)})${
        cores.reset
      }`
    );
  });
}

// Função para gerenciar juros
async function gerenciarJuros(dados, divida) {
  // Inicializa o histórico de juros se não existir
  if (!divida.historicoJuros) {
    divida.historicoJuros = [
      {
        data: divida.dataCriacao,
        valor: divida.jurosMensais || 0,
      },
    ];
  }

  while (true) {
    console.log('\nHistórico de juros:');
    const opcoesJuros = divida.historicoJuros.map((juros, index) => {
      const data = index === 0 ? 'Data de criação' : formatarData(juros.data);
      return `${data}: ${juros.valor}%`;
    });

    const { acao } = await prompt([
      {
        type: 'list',
        name: 'acao',
        message: 'Selecione um juros ou adicione um novo:',
        choices: ['Voltar', 'Adicionar novo juros', ...opcoesJuros],
      },
    ]);

    if (acao === 'Voltar') {
      return await alterarDivida(dados);
    }

    if (acao === 'Adicionar novo juros') {
      const { valor, data } = await prompt([
        {
          ...validarValorMonetario,
          name: 'valor',
          message: 'Novo valor dos juros (%):',
        },
        {
          type: 'input',
          name: 'data',
          message: 'Data de início (DD/MM/YYYY):',
        },
      ]);

      if (!validarData(data)) {
        console.log('Data inválida! Use o formato DD/MM/YYYY');
        continue;
      }

      divida.historicoJuros.push({
        data: converterDataParaISO(data),
        valor: Number(valor),
      });

      // Ordena o histórico de juros por data
      divida.historicoJuros.sort((a, b) => new Date(a.data) - new Date(b.data));
      console.log('Juros adicionados com sucesso!');
      salvarDados(dados);
      continue;
    }

    // Se chegou aqui, selecionou um juros existente
    const index = opcoesJuros.indexOf(acao);
    const juros = divida.historicoJuros[index];

    const { subAcao } = await prompt([
      {
        type: 'list',
        name: 'subAcao',
        message: 'O que deseja fazer com este juros?',
        choices: ['Voltar', 'Alterar', ...(index > 0 ? ['Remover'] : [])],
      },
    ]);

    if (subAcao === 'Voltar') {
      continue;
    }

    if (subAcao === 'Alterar') {
      const prompts = [
        {
          ...validarValorMonetario,
          name: 'valor',
          message: 'Novo valor dos juros (%):',
          default: juros.valor.toString(),
        },
      ];

      // Só adiciona o prompt de data se não for o juros da criação
      if (index > 0) {
        prompts.push({
          type: 'input',
          name: 'data',
          message: 'Nova data de início (DD/MM/YYYY):',
          default: formatarData(juros.data),
        });
      }

      const respostas = await prompt(prompts);

      juros.valor = Number(respostas.valor);
      if (index > 0 && validarData(respostas.data)) {
        juros.data = converterDataParaISO(respostas.data);
      }

      // Ordena o histórico de juros por data
      divida.historicoJuros.sort((a, b) => new Date(a.data) - new Date(b.data));
      console.log('Juros alterados com sucesso!');
    } else if (subAcao === 'Remover') {
      divida.historicoJuros.splice(index, 1);
      console.log('Juros removidos com sucesso!');
    }

    salvarDados(dados);
  }
}

// Executa o programa
menuPrincipal();
