import { User, UserRole } from '../types';
import { isEdsonUser } from './identity';
import { setorChave } from '../kpis/kpis';

// ADMINISTRA USUÁRIOS (TI) — migração 032, decisão do Edson (07/10/2026), pedido para o Luiz Henrique (TI):
//   "dê permissão para ele criar o usuário, excluir o usuário, exceto o meu … sem que ele possa ver os salários."
// É uma MARCA (users.admin_usuarios), não um cargo: GESTOR/COORDENADOR abririam a engenharia e o R$. Quem tem a marca e
// não é o Edson nem GESTOR/COORDENADOR usa a Equipe no "modo TI":
//   · cria e edita só com os cargos comuns (PROJETISTA, PROCESSOS com ou sem "Somente OKR", QUALIDADE, REPRESENTANTE);
//   · conta nova nasce SEM senha digitada por ele (o servidor sorteia e a pessoa cria a dela pelo código no e-mail),
//     e o e-mail é obrigatório;
//   · numa conta que já existe não troca e-mail, login nem senha (trocar e-mail = tomar a conta);
//   · não edita as contas altas (CEO, Diretor Industrial, GESTOR, COORDENADOR, admin de OKR, visualizador/ADM Externo,
//     quem também administra usuários), o Edson, o usuário teste nem a própria (cargo/marcas/setor dele: só o Edson) —
//     só exclui/desliga as altas;
//   · exclui e desliga todo mundo, menos o Edson e o teste (quem tem registros: só desligar — a trava 409 do servidor);
//   · define o setor, menos o P&D (reservado) e o "Teste" (031);
//   · conta sem e-mail da empresa só fica com ele como representante: não a passa a outro cargo nem edita a conta comum
//     assim (07/10, a conta-fantoche pelo representante);
//   · nunca vê salário, R$, custo/hora nem o Log de Auditoria.
// Esta tela só ESCONDE; quem barra de verdade é o servidor (/api/users/*), que lê o cadastro na hora.

export const EDSON_ID = '1e570c78-7278-4e8d-a90e-a820c11bb07a';

/** Os cargos que quem administra usuários pela marca dá (ao criar e ao editar). */
export const CARGOS_DO_TI: readonly UserRole[] = ['PROJETISTA', 'PROCESSOS', 'QUALIDADE', 'REPRESENTANTE'];

/** Cargos das "contas altas": o modo TI exclui/desliga, não edita. */
const CARGOS_ALTOS: readonly string[] = ['CEO', 'DIRETOR_INDUSTRIAL', 'GESTOR', 'COORDENADOR', 'ADM_EXTERNO'];

/** Setores que o modo TI não dá nem tira: o P&D (reservado ao Edson) e o "Teste" (031). Pela chave, como o servidor. */
const SETORES_VEDADOS_AO_TI = ['p d', 'teste'];
export const setorVedadoAoTI = (setor?: string | null): boolean => SETORES_VEDADOS_AO_TI.includes(setorChave(setor));
export const SETOR_VEDADO_AO_TI_MSG = 'O P&D e o setor "Teste" são do Edson: só ele põe ou tira alguém deles.';

/** Os domínios de e-mail da empresa (o servidor tem a mesma lista: ALLOWED_EMAIL_DOMAINS em api/index.ts). */
export const DOMINIOS_DA_EMPRESA: readonly string[] = ['joinvilleimplementos.com.br', 'furgoesjoinville.com.br', 'jimp.com.br'];
/** O e-mail é de um domínio da empresa? (como o recipientAllowed do servidor: o que vem depois da @, sem diferença de caixa) */
export const emailDaEmpresa = (email?: string | null): boolean => {
  const a = String(email || '').trim().toLowerCase();
  return a.includes('@') && DOMINIOS_DA_EMPRESA.includes(a.split('@')[1] || '');
};
/**
 * Conta SEM e-mail da empresa: o modo TI só a mantém como representante (07/10, achado da crítica: o TI criava um
 * representante com um e-mail dele, de fora, e no editar o passava a PROJETISTA num setor comum — a conta-fantoche).
 * O representante assim edita (o contato), mas o cargo fica Representante; a conta comum assim, o TI não edita.
 */
export const tiSoComoRepresentante = (alvo: Pick<User, 'email'>): boolean => !emailDaEmpresa(alvo.email);
export const TI_EMAIL_FORA_MSG = 'Esta conta não tem e-mail da empresa: você só a mantém como representante. Outro cargo, o setor ou as marcas dela, peça ao Edson (ou a um GESTOR).';

/** É o Edson (pelo id; o e-mail/login como na regra antiga da tela). */
export const ehOEdson = (u?: Pick<User, 'id' | 'email' | 'username'> | null): boolean =>
  !!u && (u.id === EDSON_ID || isEdsonUser(u));

/**
 * Quem está logado usa a Equipe no MODO TI: tem a marca e não é o Edson nem GESTOR/COORDENADOR (esses seguem como hoje).
 * A marca do logado vem do login (authService); sem o campo = false.
 */
export const ehModoTI = (eu?: Pick<User, 'id' | 'email' | 'username' | 'role' | 'adminUsuarios'> | null): boolean =>
  !!eu && eu.adminUsuarios === true && !ehOEdson(eu) && eu.role !== 'GESTOR' && eu.role !== 'COORDENADOR';

/**
 * A aba Equipe abre pela marca (mesmo "Somente OKR"). O visualizador (okr_viewer/ADM Externo) nunca — o banco só lhe
 * entrega a própria linha e ele não grava nada — e o representante também não (o banco só lhe entrega a própria linha).
 */
export const abreEquipePelaMarca = (
  eu: Pick<User, 'role' | 'adminUsuarios'> | null | undefined,
  isOkrViewer: boolean,
): boolean => !!eu && eu.adminUsuarios === true && !isOkrViewer && eu.role !== 'REPRESENTANTE' && eu.role !== 'ADM_EXTERNO';

/**
 * Por que o modo TI NÃO edita esta conta (null = edita). `okrAdmins` / `adminsUsuarios` = os ids com okr_admin / com
 * admin_usuarios, quando a tela conseguiu ler (null = não sei: o servidor recusa com 403 e a tela mostra a frase dele).
 */
export const porqueTINaoEdita = (
  alvo: Pick<User, 'id' | 'email' | 'username' | 'role' | 'okrViewer' | 'okrAdmin' | 'sector' | 'adminUsuarios'>,
  eu: Pick<User, 'id'>,
  okrAdmins: Set<string> | null,
  adminsUsuarios: Set<string> | null = null,
): string | null => {
  if (alvo.id === eu.id) return 'A sua conta: o contato fica em "Meu Perfil" (no topo); cargo, marcas e setor, só o Edson muda.';
  if (ehOEdson(alvo)) return 'A conta do Edson só ele altera.';
  if (setorChave(alvo.sector) === 'teste') return 'O usuário teste é só do Edson.';
  if (CARGOS_ALTOS.includes(alvo.role) || !!alvo.okrViewer || !!alvo.okrAdmin || !!(okrAdmins && okrAdmins.has(alvo.id)))
    return 'Conta alta (CEO, Diretor, Gestor, Coordenador, admin de OKR ou visualizador): você pode desligar ou excluir; editar é do Edson ou de um GESTOR.';
  if (alvo.adminUsuarios === true || !!(adminsUsuarios && adminsUsuarios.has(alvo.id)))
    return 'Quem também administra usuários só o Edson edita: você pode desligar ou excluir.';
  // conta comum sem e-mail da empresa (o representante, de fora, segue editável — só o cargo fica Representante)
  if (alvo.role !== 'REPRESENTANTE' && tiSoComoRepresentante(alvo))
    return 'Esta conta não tem e-mail da empresa: editar é do Edson ou de um GESTOR; você pode desligar ou excluir.';
  return null;
};

/** O modo TI exclui/desliga esta conta? Todos, menos o Edson, o teste e a própria. */
export const tiExcluiOuDesliga = (
  alvo: Pick<User, 'id' | 'email' | 'username' | 'sector'>,
  eu: Pick<User, 'id'>,
): boolean => alvo.id !== eu.id && !ehOEdson(alvo) && setorChave(alvo.sector) !== 'teste';

/** E-mail obrigatório e com cara de e-mail (o servidor confere de novo): é por ele que a pessoa cria a senha. */
export const emailValido = (email?: string | null): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
