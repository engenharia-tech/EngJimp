import React, { useState, useEffect, useRef } from 'react';
import { UserPlus, Shield, User as UserIcon, CheckCircle, Loader2, Eye, Activity, Briefcase, Edit, X, Trash2, AlertCircle, Database, Copy, UserX, Factory, Handshake, Lock } from 'lucide-react';
import { User, UserRole } from '../types';
import { isEdsonUser } from '../utils/identity';
import { ehVisaoCeo, ehRepresentante, PREFIXO_SETOR_REPRESENTANTE } from '../utils/cargos';
import { ehSetorDeRepresentante, SETOR_DE_REPRESENTANTE_MSG } from '../kpis/kpis';
import { EDSON_ID, CARGOS_DO_TI, ehModoTI, porqueTINaoEdita, tiExcluiOuDesliga, setorVedadoAoTI, SETOR_VEDADO_AO_TI_MSG, emailValido, tiSoComoRepresentante, TI_EMAIL_FORA_MSG } from '../utils/adminUsuarios';
import { registerUser, fetchUsers, updateUser, deleteUser, deleteAllIssues, removeDuplicateProjects, findDuplicateProjects, deleteProjectById, DuplicateGroup, updateSettings, fetchAppState, recalculateAllProjectCosts, addAuditLog, desligarUsuario, lerIdsComMarca } from '../services/storageService';
import { getWebhookUrl, saveWebhookUrl } from '../services/webhookService';
import { useToast } from './Toast';
import { useLanguage } from '../i18n/LanguageContext';
import { Dialog } from './Dialog';
import { hojeJoinville, ultimoDiaTrabalhado } from '../utils/custoHora';

// 'AAAA-MM-DD' → 'dd/mm/aaaa' (ou 'dd/mm' com curto) pelo texto — sem Date, o fuso não troca o dia.
const diaBr = (dia: string | null | undefined, curto = false): string => {
  const [a, m, d] = String(dia || '').slice(0, 10).split('-');
  if (!a || !m || !d) return String(dia || '');
  return curto ? `${d}/${m}` : `${d}/${m}/${a}`;
};
// O primeiro dia em que o desligamento vale para a rota (/api/users/desligar recusa antes disto).
const DESLIGAR_DESDE = '2026-01-01';

interface UserManagementProps {
    currentUser: User;
    onUsersChange?: () => void;
}

// O "Script de Correção TOTAL" DESLIGA a segurança do banco (RLS) em 10 tabelas e cria
// regras que deixam qualquer um ler e gravar tudo — rodá-lo abriria a engenharia inteira
// até para o admin de visualização (ADM Externo). Fica fora da tela; erro de banco vai
// para quem administra o sistema, não para um script colado no editor.
const MOSTRAR_CORRECAO_TOTAL = false;
const AVISO_ERRO_DE_BANCO = 'Avise quem administra o sistema. Não rode scripts de "correção": eles desligam a segurança do banco.';

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser, onUsersChange }) => {
  const { addToast } = useToast();
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  
  // Webhook State
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showWebhookHelp, setShowWebhookHelp] = useState(false);

  // Settings State
  const [hourlyCost, setHourlyCost] = useState<number>(0);

  // ADMINISTRA USUÁRIOS (TI) — 032, decisão do Edson (07/10/2026). Quem tem a marca e não é o Edson nem GESTOR/
  // COORDENADOR usa esta tela no "modo TI" (ver src/utils/adminUsuarios.ts): cargos comuns, conta nova sem senha,
  // e-mail/login/senha de conta existente só leitura, contas altas sem Editar, nada de salário/R$. O Edson (pelo id) é o
  // único que vê e muda a marca. GESTOR, COORDENADOR e o Edson seguem com a tela de sempre.
  const modoTI = ehModoTI(currentUser);
  const souEdsonId = currentUser.id === EDSON_ID;
  // Quem precisa saber quem tem a marca: o Edson (a caixa), o modo TI (não edita outro TI) e GESTOR/COORDENADOR (e-mail,
  // login e senha de quem a tem são só do Edson — o formulário deles mostra os dois só leitura, 07/10).
  const leMarcaTI = souEdsonId || modoTI || currentUser.role === 'GESTOR' || currentUser.role === 'COORDENADOR';
  // As marcas lidas à parte (lerIdsComMarca): undefined = ainda não pedi/não é para mim; null = não consegui ler.
  const [idsAdminUsuarios, setIdsAdminUsuarios] = useState<Set<string> | null | undefined>(undefined);   // o Edson e o modo TI
  const [idsOkrAdmin, setIdsOkrAdmin] = useState<Set<string> | null | undefined>(undefined);             // só o modo TI

  useEffect(() => {
      setWebhookUrl(getWebhookUrl());
      // O custo/hora é R$: o modo TI nem pede a carga (e o estado abaixo não aparece na tela).
      if (modoTI) return;
      // Load settings from app state
      const loadSettings = async () => {
          const state = await fetchAppState();
          if (state.settings) {
              setHourlyCost(state.settings.hourlyCost);
          }
      };
      loadSettings();
  }, []);

  const handleSaveWebhook = () => {
      saveWebhookUrl(webhookUrl);
      addToast(t("webhookUrlSavedSuccess"), "success");
  };
  
  // Form State
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('PROJETISTA');
  const [salary, setSalary] = useState<number>(0);
  // OKR e Agenda para todos (Edson, 30/09: "libere okr e agenda para todos"): usuário novo
  // já nasce com OKR; quem cria pode desmarcar. O visualizador continua sem (a marca dele zera).
  const [okrEnabled, setOkrEnabled] = useState<boolean>(true);
  const [okrOnly, setOkrOnly] = useState<boolean>(false);
  const [okrViewer, setOkrViewer] = useState<boolean>(false);
  const [sector, setSector] = useState<string>('');
  const [setorTocado, setSetorTocado] = useState(false);
  const [setorCarregado, setSetorCarregado] = useState('');
  const editandoRef = useRef<string | null>(null);              // quem está no formulário AGORA (o 409 relê no fundo)   // o setor que o formulário mostrou ao abrir (vai como sectorAntes)
  const [isRegistering, setIsRegistering] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteConfirmationUser, setDeleteConfirmationUser] = useState<User | null>(null);
  // Desligar (decisão do Edson, 30/09/2026: desligar, não excluir — tudo o que a pessoa fez continua
  // no nome dela). O modal pede o ÚLTIMO dia trabalhado (até hoje; o servidor recusa data futura).
  const [desligarAlvo, setDesligarAlvo] = useState<User | null>(null);
  const [desligarDia, setDesligarDia] = useState<string>('');
  const [desligarErro, setDesligarErro] = useState<string>('');
  const [isDesligando, setIsDesligando] = useState(false);
  // A caixa "Administra usuários (TI)" (só o Edson, no editar): o valor e se ele mexeu (só vai ao servidor se mexeu).
  const [adminUsuariosMarca, setAdminUsuariosMarca] = useState(false);
  const [adminUsuariosTocado, setAdminUsuariosTocado] = useState(false);

  useEffect(() => {
    loadList();
  }, []);

  const loadList = async () => {
    setLoadingList(true);
    // A Equipe mostra todo mundo, inclusive o ADM Externo. Junto, a marca que cada um precisa (032): o Edson, quem
    // administra usuários (a caixa); GESTOR/COORDENADOR, quem administra usuários (e-mail/login só leitura); o modo TI,
    // quem administra usuários e quem é admin de OKR (não edita — o cadeado; a 032 dá a leitura de okr_admin). Sem
    // leitura = null ("não sei").
    const [list, marcaTI, marcaOkr] = await Promise.all([
      fetchUsers({ incluirExternos: true }),
      leMarcaTI ? lerIdsComMarca('admin_usuarios') : Promise.resolve(undefined),
      modoTI ? lerIdsComMarca('okr_admin') : Promise.resolve(undefined),
    ]);
    const sortedList = [...list].sort((a, b) => a.name.localeCompare(b.name));
    setUsers(sortedList);
    setIdsAdminUsuarios(marcaTI);
    setIdsOkrAdmin(marcaOkr);
    setLoadingList(false);
    return sortedList;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    // O setor de um representante é só dele (06/10/2026, "cada um só os seus"): quem não é representante não
    // recebe um — veria, editaria e excluiria os indicadores dele (028). Só quando o setor foi mudado aqui (o de
    // quem deixou de ser representante fica como está); pela chave, como o banco ("Representante - João"…).
    if (!representanteEfetivo && podeMudarSetor && setorTocado && sector.trim() !== setorCarregado && ehSetorDeRepresentante(sector)) {
      addToast(SETOR_DE_REPRESENTANTE_MSG, 'error');
      return;
    }
    // Modo TI (032): a tela já só oferece o permitido; isto segura o que escapar (o servidor confere de novo).
    const contaAntes = editingUserId ? users.find(u => u.id === editingUserId) : undefined;
    if (modoTI) {
      if (!CARGOS_DO_TI.includes(role)) { addToast('Você dá só os cargos Projetista, Processos, Qualidade e Representante.', 'error'); return; }
      if (editingUserId && (!contaAntes || porqueNaoEdita(contaAntes))) {
        addToast((contaAntes && porqueNaoEdita(contaAntes)) || 'Não achei esta conta na lista. Recarregue a tela.', 'error');
        return;
      }
      if (!editingUserId && !emailValido(email)) { addToast('Informe um e-mail válido: é por ele que a pessoa cria a própria senha.', 'error'); return; }
      // conta sem e-mail da empresa: só como representante (07/10; o servidor confere de novo)
      if (editingUserId && contaAntes && role !== 'REPRESENTANTE' && tiSoComoRepresentante(contaAntes)) { addToast(TI_EMAIL_FORA_MSG, 'error'); return; }
      if (setorTocado && sector.trim() !== setorCarregado && setorVedadoAoTI(sector)) { addToast(SETOR_VEDADO_AO_TI_MSG, 'error'); return; }
    }
    setIsRegistering(true);

    const userPayload: User & { sectorAntes?: string } = {
      id: editingUserId || crypto.randomUUID(),
      name,
      surname,
      // Modo TI: numa conta que já existe, e-mail e login vão como estão no cadastro (os campos são só leitura). O mesmo
      // para o GESTOR/COORDENADOR na conta de quem administra usuários (identidadeTravada, 07/10).
      email: identidadeTravada && contaAntes ? (contaAntes.email || '') : email,
      phone,
      username: identidadeTravada && contaAntes ? contaAntes.username : username,
      // Modo TI: nunca manda senha — a conta nova nasce com senha sorteada pelo servidor e a pessoa cria a dela pelo
      // código no e-mail; a de quem já existe não muda. Na conta de quem administra usuários, só o Edson manda senha.
      password: modoTI || alvoTemMarcaTI ? '' : password,
      role,
      salary,
      // Admin de visualização não tem OKR próprio nem é "somente OKR" (o servidor também força).
      // O REPRESENTANTE (06/10/2026) é sempre "Somente OKR", com OKR, e nunca visualizador — o
      // servidor e o banco (030) forçam o mesmo.
      okrEnabled: representanteEfetivo ? true : viewerEfetivo ? false : (okrEnabled || okrOnly),
      okrOnly: representanteEfetivo ? true : viewerEfetivo ? false : okrOnly,
      // Só quem pode mexer na marca a manda; o resto não manda (o servidor mantém a
      // do cadastro) — assim uma lista aberta há horas não desfaz nem esbarra na marca.
      okrViewer: canMarkOkrViewer ? viewerEfetivo : undefined,
      // O setor abre o KPI do setor: só o Edson e os admins de OKR o mandam (o servidor confere);
      // os demais não mandam o campo e o servidor mantém o do cadastro.
      // …e só se foi TOCADO: a lista aberta há horas não desfaz a troca que outro admin acabou de fazer.
      // O do representante nunca vai: o banco põe o setor só dele (030).
      sector: podeMudarSetor && setorTocado && !representanteEfetivo ? sector : undefined,
      // …e diz qual setor a tela via: se outro admin o mudou no meio, o servidor recusa (409).
      sectorAntes: podeMudarSetor && setorTocado && !representanteEfetivo && editingUserId ? setorCarregado : undefined,
      // "Administra usuários (TI)" (032): só o Edson manda, só no editar de outra pessoa e só se mexeu na caixa; sem o
      // campo, o servidor mantém a marca do cadastro.
      adminUsuarios: mostraCaixaAdminUsuarios && adminUsuariosTocado ? adminUsuariosMarca : undefined,
    };

    let result;
    if (editingUserId) {
      result = await updateUser(userPayload);
    } else {
      result = await registerUser(userPayload);
    }
    
    if (result.success) {
      addToast(editingUserId ? t('userUpdatedSuccess', { name }) : t('userCreatedSuccess', { name }), 'success');
      if (result.message) addToast(result.message, 'warning'); // gravou, mas o servidor tem algo a dizer
      
      // Expanded Audit Log comparing old vs new values
      let details = '';
      if (editingUserId) {
        const oldUser = users.find(u => u.id === editingUserId);
        const changedProps: string[] = [];
        if (oldUser) {
          if (oldUser.name !== name) changedProps.push(`Nome (ex: "${oldUser.name}", novo: "${name}")`);
          if ((oldUser.surname || '') !== surname) changedProps.push(`Sobrenome (ex: "${oldUser.surname || ''}", novo: "${surname}")`);
          // O que FOI enviado (no modo TI, e-mail e login vão os do cadastro, mesmo que o campo tenha sido mexido).
          if ((oldUser.email || '') !== (userPayload.email || '')) changedProps.push(`E-mail (ex: "${oldUser.email || ''}", novo: "${userPayload.email || ''}")`);
          if ((oldUser.phone || '') !== phone) changedProps.push(`Telefone (ex: "${oldUser.phone || ''}", novo: "${phone}")`);
          if (oldUser.username !== userPayload.username) changedProps.push(`Login (ex: "${oldUser.username}", novo: "${userPayload.username}")`);
          if (oldUser.role !== role) changedProps.push(`Cargo (ex: "${oldUser.role}", novo: "${role}")`);
          const trocaSetor = (result as { setor?: { de: string; para: string } }).setor;
          if (trocaSetor) changedProps.push(`Setor (ex: "${trocaSetor.de}", novo: "${trocaSetor.para}")`);
          // Salário é só do Edson, mas o Log de Auditoria é lido por GESTOR, CEO e COORDENADOR
          // (migração 011): o log diz QUE mudou, nunca os valores (decisão do Edson, 30/09).
          if ((oldUser.salary || 0) !== salary) changedProps.push('Salário (alterado)');
          if (userPayload.adminUsuarios !== undefined && (!idsAdminUsuarios || idsAdminUsuarios.has(oldUser.id) !== userPayload.adminUsuarios))
            changedProps.push(`Administra usuários (TI) (${userPayload.adminUsuarios ? 'dada' : 'tirada'})`);
        }
        details = changedProps.length > 0 
          ? `Usuário ${userPayload.username} editado por ${currentUser.name}. Modificações: ${changedProps.join(', ')}`
          : `Usuário ${userPayload.username} editado por ${currentUser.name} sem alterações de conteúdo.`;
      } else {
        details = `Usuário ${userPayload.username} [Cargo: ${userPayload.role}] criado por ${currentUser.name}`;
      }

      addAuditLog({
          userId: currentUser.id,
          userName: currentUser.name,
          action: editingUserId ? 'UPDATE' : 'CREATE',
          entityType: 'USER',
          // Na criação, o id é o que o servidor sorteou (o da tela é ignorado — 07/10).
          entityId: editingUserId ? userPayload.id : ((result as { id?: string }).id || userPayload.id),
          entityName: userPayload.username,
          details
      });

      await loadList(); // Refresh list
      onUsersChange?.(); // Refresh global app state
      resetForm();
    } else {
      console.error("Register error:", result.message);
      if (result.message?.includes('violates check constraint') || result.message?.includes('users_role_check')) {
          addToast('O banco não aceitou este cargo. ' + AVISO_ERRO_DE_BANCO, 'error');
      } else if (result.message?.includes('policy')) {
          addToast('O banco bloqueou a ação (permissão). ' + AVISO_ERRO_DE_BANCO, 'error');
      } else {
          addToast(result.message || `Erro ao ${editingUserId ? 'atualizar' : 'criar'} usuário.`, 'error');
      }
      // O setor mudou por outro admin no meio: relê a lista (a linha mostra o de agora) e o próximo
      // "Salvar" já compara com ele — a decisão de sobrescrever fica com quem leu o aviso.
      if (editingUserId && result.message?.includes('mudou enquanto a tela estava aberta')) {
        const lista = await loadList();
        const fresco = lista.find(u => u.id === editingUserId);
        if (fresco && editandoRef.current === editingUserId) setSetorCarregado((fresco.sector || '').trim());   // ainda é a mesma pessoa no formulário
        onUsersChange?.();
      }
    }
    setIsRegistering(false);
  };

  const handleDelete = (user: User) => {
    setDeleteConfirmationUser(user);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationUser) return;
    const user = deleteConfirmationUser;
    setDeleteConfirmationUser(null);

    console.log("Attempting to delete user:", user.id);
    setLoadingList(true);
    try {
        const result = await deleteUser(user.id);
        console.log("Delete result:", result);
        
        if (result.success) {
          addToast(`Usuário ${user.name} excluído com sucesso!`, 'success');
          if (result.message) addToast(result.message, 'warning'); // ex.: o OKR dele não foi arquivado

          // Audit Log
          addAuditLog({
              userId: currentUser.id,
              userName: currentUser.name,
              action: 'DELETE',
              entityType: 'USER',
              entityId: user.id,
              entityName: user.username,
              details: `Usuário ${user.username} (${user.name}) excluído por ${currentUser.name}`
          });

          await loadList();
          onUsersChange?.(); // Refresh global app state
        } else {
          if (result.message?.includes('violates foreign key') || result.message?.includes('constraint')) {
             addToast('Não é possível excluir: existem projetos vinculados a este usuário. ' + AVISO_ERRO_DE_BANCO, 'error');
          } else {
             addToast(result.message || 'Erro ao excluir usuário.', 'error');
          }
        }
    } catch (err) {
        console.error("Exception in handleDelete:", err);
        addToast("Erro inesperado ao excluir usuário.", 'error');
    } finally {
        setLoadingList(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const abrirDesligar = (user: User) => {
    setDesligarAlvo(user);
    setDesligarDia(hojeJoinville());
    setDesligarErro('');
  };

  const fecharDesligar = () => {
    if (isDesligando) return;
    setDesligarAlvo(null);
    setDesligarErro('');
  };

  // Quem aperta é o Edson ou um GESTOR; o SERVIDOR confere de novo (cargo lido do cadastro), grava
  // tudo numa transação só (datas, senha sorteada, e-mail fora) e recalcula o custo/hora a partir do
  // dia seguinte ao último dia — nunca antes do 1º dia do mês corrente (mês fechado não muda).
  const confirmarDesligar = async () => {
    if (!desligarAlvo || isDesligando) return;
    const alvo = desligarAlvo;
    const ultimoDia = desligarDia;
    const hoje = hojeJoinville();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ultimoDia)) { setDesligarErro('Informe o último dia trabalhado.'); return; }
    if (ultimoDia > hoje) { setDesligarErro('O último dia não pode ser no futuro: desligue no fim do último dia.'); return; }
    if (ultimoDia < DESLIGAR_DESDE) { setDesligarErro(`O último dia não pode ser antes de ${diaBr(DESLIGAR_DESDE)}.`); return; }

    setIsDesligando(true);
    setDesligarErro('');
    try {
      const result = await desligarUsuario(alvo.id, ultimoDia);
      if (!result.success) {
        setDesligarErro(result.message || 'Não consegui desligar agora. Tente de novo.');
        return;
      }
      setDesligarAlvo(null);
      // O modo TI (032) não ouve falar de custo: "Desligado." e só.
      addToast(result.custoDesde && !modoTI ? `Desligado. O custo muda a partir de ${diaBr(result.custoDesde, true)}.` : 'Desligado.', 'success');
      if (result.message) addToast(result.message, 'warning'); // desligou, mas o servidor tem algo a dizer
      // O log diz quem e quando, nunca salário nem custo (o Log é lido por GESTOR, CEO e COORDENADOR).
      addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'UPDATE',
        entityType: 'USER',
        entityId: alvo.id,
        entityName: alvo.username,
        details: `Usuário ${alvo.username} (${alvo.name}) desligado (último dia ${diaBr(ultimoDia)}) por ${currentUser.name}`
      });
      await loadList();
      onUsersChange?.();
    } catch {
      setDesligarErro('Erro ao conectar ao servidor.');
    } finally {
      setIsDesligando(false);
    }
  };

  // Selo junto do nome: "DESLIGA EM dd/mm" enquanto o último dia não passou (no último dia ainda é
  // ativo) e "DESLIGADO · ÚLTIMO DIA dd/mm/aaaa" depois.
  const seloDesligado = (u: User) => {
    const ultimo = ultimoDiaTrabalhado(u);
    if (!ultimo) return null;
    const passou = ultimo < hojeJoinville();
    return (
      <span
        title={`Último dia trabalhado: ${diaBr(ultimo)}`}
        className={`font-mono text-[10px] font-bold tracking-[0.12em] uppercase px-1.5 py-0.5 rounded border ${passou
          ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-900/40'
          : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40'}`}
      >
        {passou ? `Desligado · último dia ${diaBr(ultimo)}` : `Desliga em ${diaBr(ultimo, true)}`}
      </span>
    );
  };

  const resetForm = () => {
    setName('');
    setSurname('');
    setEmail('');
    setPhone('');
    setUsername('');
    setPassword('');
    setSalary(0);
    setRole('PROJETISTA');
    setOkrEnabled(true);
    setOkrOnly(false);
    setOkrViewer(false);
    setSector(''); setSetorTocado(false); setSetorCarregado(''); editandoRef.current = null;
    setAdminUsuariosMarca(false); setAdminUsuariosTocado(false);
    setEditingUserId(null);
  };

  const handleEdit = (user: User) => {
    // Modo TI (032): conta que ele não edita nem abre o formulário (o botão já não aparece; isto segura o resto).
    const porque = porqueNaoEdita(user);
    if (porque) { addToast(porque, 'warning'); return; }
    setAdminUsuariosMarca(!!(idsAdminUsuarios && idsAdminUsuarios.has(user.id))); setAdminUsuariosTocado(false);
    setName(user.name);
    setSurname(user.surname || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setUsername(user.username);
    setPassword(''); // senha nao vem mais do banco; em branco = manter a atual
    setRole(user.role);
    setSalary(user.salary || 0);
    setOkrEnabled(!!user.okrEnabled);
    setOkrOnly(!!user.okrOnly);
    setOkrViewer(!!user.okrViewer);
    setSector(user.sector || ''); setSetorTocado(false); setSetorCarregado((user.sector || '').trim()); editandoRef.current = user.id;
    setEditingUserId(user.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getRoleIcon = (role: UserRole) => {
      switch(role) {
          case 'GESTOR': return <Shield className="w-3 h-3 text-blue-600" />;
          case 'CEO': return <Briefcase className="w-3 h-3 text-yellow-600" />;
          case 'COORDENADOR': return <Eye className="w-3 h-3 text-teal-600" />;
          case 'PROCESSOS': return <Activity className="w-3 h-3 text-purple-600" />;
          case 'DIRETOR_INDUSTRIAL': return <Factory className="w-3 h-3 text-yellow-600" />;
          case 'REPRESENTANTE': return <Handshake className="w-3 h-3 text-orange-600" />;
          default: return <UserIcon className="w-3 h-3 text-gray-600" />;
      }
  };

  const isGestor = currentUser.role === 'GESTOR';
  // Salario e um dado do DONO: SO o Edson ve/edita — nem outros gestores (C2).
  // Fonte unica: isEdsonUser (mesma regra do servidor claimsAreEdson). [[identity]]
  const isEdson = isEdsonUser(currentUser);
  const isCoordenador = currentUser.role === 'COORDENADOR';
  // Só o Edson (ou um GESTOR que também seja admin de OKR) marca o "admin de visualização" e
  // o grupo ADM Externo — o servidor confere. Um CEO admin de OKR não (Edson, 30/09: "só um
  // GESTOR ou você muda quem é só visualização"). O próprio Edson nunca é marcado.
  const canMarkOkrViewer = isEdson || (!!currentUser.okrAdmin && isGestor);
  // O SETOR é a porta do KPI dos setores (a pessoa vê e lança os indicadores do setor dela): só o
  // Edson e os admins de OKR o mudam, inclusive na criação (decisão do Edson, 30/09). O servidor
  // confere pelo cadastro.
  // O modo TI (032, decisão do Edson 07/10) também define o setor — menos o P&D e o "Teste" (setorVedadoAoTI).
  const podeMudarSetor = isEdson || (!!currentUser.okrAdmin && !ehVisaoCeo(currentUser.role)) || modoTI;   // o CEO e o Diretor Industrial não (01/10: visão macro; 06/10)
  // REPRESENTANTE (06/10/2026): só um GESTOR ou o Edson dá o cargo (e o tira) — o servidor confere. O modo TI também
  // (032, 07/10: é um dos cargos comuns); antes da 029 o banco recusa o representante para todos.
  const podeDarRepresentante = isGestor || isEdson || modoTI;
  // Os setores já usados na Equipe, com a grafia mais comum — sugere para não nascer "Suprimento"
  // ao lado de "Suprimentos" (o KPI junta maiúsculas e acentos, mas não singular com plural).
  const setoresUsados = React.useMemo(() => {
    const cont = new Map<string, Map<string, number>>();
    users.forEach(u => {
      const g = (u.sector || '').trim(); if (!g) return;
      if (ehSetorDeRepresentante(g)) return;   // o setor de cada representante é só dele (06/10): não se sugere a outro
      if (modoTI && setorVedadoAoTI(g)) return;  // o P&D e o "Teste" não são do modo TI (032): não se sugerem
      const k = g.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const m = cont.get(k) || new Map<string, number>(); m.set(g, (m.get(g) || 0) + 1); cont.set(k, m);
    });
    return Array.from(cont.values()).map(m => Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0][0]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [users, modoTI]);
  const EDSON_UUID = EDSON_ID;
  // O grupo ADM Externo É o visualizador — deduzido na hora, não gravado no estado: escolher
  // o cargo por engano e voltar não deixa a pessoa marcada nem com o OKR desligado.
  // O REPRESENTANTE (06/10/2026, pedido do Edson: os vendedores "precisam escrever seus OKRs assim como os
  // seus KPIs") é sempre "Somente OKR" com OKR, e nunca visualizador — deduzido do cargo do mesmo jeito.
  const representanteEfetivo = ehRepresentante(role);
  const viewerEfetivo = !representanteEfetivo && (okrViewer || role === 'ADM_EXTERNO');
  // O setor do representante é só dele: o banco o põe ao gravar (Representante — Nome Sobrenome, espaços juntados).
  // Mas o banco (030) MANTÉM o que já começa com "Representante — " ("quem muda o nome depois não muda o setor") e o
  // servidor manda o do cadastro: a prévia mostra esse, e só calcula pelo nome quando o banco vai calcular.
  const setorDoRepresentante = setorCarregado.startsWith(PREFIXO_SETOR_REPRESENTANTE)
    ? setorCarregado
    : PREFIXO_SETOR_REPRESENTANTE + `${name} ${surname}`.replace(/\s+/g, ' ').trim();
  // Gestor can do everything. Coordenador can view. Everyone can edit themselves.
  
  // Modo TI (032): cria, exclui e desliga também — todos menos o Edson, o teste e a própria conta (tiExcluiOuDesliga).
  const canCreateUser = isGestor || modoTI;
  const canDeleteUser = (targetUser: User) => isGestor || (modoTI && tiExcluiOuDesliga(targetUser, currentUser));
  // Desligar: o Edson (pelo id) ou um GESTOR — decisão do Edson, 30/09/2026 (o servidor confere pelo
  // cadastro). Nunca a si mesmo, nunca o Edson, e não aparece para quem já tem último dia gravado.
  const canDesligar = currentUser.id === EDSON_UUID || isGestor || modoTI;
  const canDesligarUser = (targetUser: User) =>
      canDesligar && targetUser.id !== currentUser.id && targetUser.id !== EDSON_UUID && !ultimoDiaTrabalhado(targetUser)
      && (!modoTI || tiExcluiOuDesliga(targetUser, currentUser));

  // Por que o modo TI não edita esta conta (null = edita, ou não é o modo TI): vira o cadeado com a dica na lista.
  const porqueNaoEdita = (targetUser: User): string | null =>
      modoTI ? porqueTINaoEdita(targetUser, currentUser, idsOkrAdmin ?? null, idsAdminUsuarios ?? null) : null;

  const canEditUser = (targetUser: User) => {
      if (modoTI) return !porqueNaoEdita(targetUser);
      if (isGestor) return true;
      if (currentUser.id === targetUser.id) return true;
      return false;
  };

  // A caixa "Administra usuários (TI)" (032): só o Edson (pelo id) a vê, no editar de OUTRA pessoa. A marca de hoje vem
  // de lerIdsComMarca; sem leitura (null) a caixa fica "indeterminada" até ele marcar ou desmarcar.
  const mostraCaixaAdminUsuarios = souEdsonId && !!editingUserId && editingUserId !== EDSON_UUID;
  const marcaAdminUsuariosDesconhecida = idsAdminUsuarios === null;
  // O banco (032, CHECK users_admin_usuarios_so_comuns) só aceita a marca em PROJETISTA, PROCESSOS ou QUALIDADE, sem
  // visualizador: em outro cargo a caixa só serve para TIRAR a marca.
  const cargoAceitaMarcaTI = ['PROJETISTA', 'PROCESSOS', 'QUALIDADE'].includes(role) && !viewerEfetivo;
  // No modo TI, e-mail, login e senha de uma conta que JÁ existe são só leitura (decisão do Edson, 07/10: trocar o
  // e-mail ou gerar código = tomar a conta).
  // …e e-mail, login e senha de quem ADMINISTRA USUÁRIOS só o Edson troca (o servidor recusa com 403 —
  // MARCA_ACESSO_SO_EDSON_MSG): no formulário do GESTOR/COORDENADOR eles ficam só leitura e a senha não é pedida.
  // Sem saber a marca (null), o formulário fica como sempre e o servidor responde a frase dele.
  const alvoTemMarcaTI = !!editingUserId && editingUserId !== currentUser.id && !souEdsonId && !modoTI
      && !!(idsAdminUsuarios && idsAdminUsuarios.has(editingUserId));
  const identidadeTravada = modoTI || alvoTemMarcaTI;
  const identidadeSoLeitura = (modoTI && !!editingUserId) || alvoTemMarcaTI;
  // …e o setor de quem está no P&D ou no "Teste" também (só o Edson tira alguém de lá).
  const setorTravadoTI = modoTI && setorVedadoAoTI(setorCarregado);
  // …e o representante sem e-mail da empresa fica representante no modo TI (07/10): o seletor só oferece esse cargo.
  const contaEmEdicao = editingUserId ? users.find(u => u.id === editingUserId) : undefined;
  const cargosDoTIAqui: readonly UserRole[] = modoTI && contaEmEdicao && tiSoComoRepresentante(contaEmEdicao) ? ['REPRESENTANTE'] : CARGOS_DO_TI;

  return (
    <div className="space-y-6">
      {/* Create/Edit User Form */}
      {(canCreateUser || editingUserId) && (
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-base font-mono font-bold uppercase tracking-[0.12em] flex items-center text-black dark:text-white">
            <UserPlus className="w-5 h-5 mr-2.5 text-orange-500" />
            {editingUserId ? (currentUser.id === editingUserId ? 'Editar Meu Perfil' : 'Editar Usuário') : 'Cadastrar Novo Usuário'}
          </h2>
          {editingUserId && (
            <button 
              onClick={resetForm}
              className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 flex items-center text-sm"
            >
              <X className="w-4 h-4 mr-1" /> Cancelar Edição
            </button>
          )}
        </div>

        <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="um-name" className="block text-sm font-medium text-black dark:text-white mb-1">Nome (Primeiro Nome)</label>
            <input
              id="um-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 dark:text-slate-200"
              required
              placeholder="Somente letras"
            />
          </div>
          <div>
            <label htmlFor="um-surname" className="block text-sm font-medium text-black dark:text-white mb-1">Sobrenome</label>
            <input
              id="um-surname"
              type="text"
              value={surname}
              onChange={e => setSurname(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 dark:text-slate-200"
              placeholder="Somente letras"
            />
          </div>
          <div>
            <label htmlFor="um-email" className="block text-sm font-medium text-black dark:text-white mb-1">E-mail{modoTI && !editingUserId && <span className="text-xs text-gray-400 dark:text-slate-500"> (obrigatório)</span>}</label>
            <input
              id="um-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              readOnly={identidadeSoLeitura}
              required={modoTI && !editingUserId}
              aria-describedby={modoTI || alvoTemMarcaTI ? 'um-email-dica' : undefined}
              className={`w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${identidadeSoLeitura ? 'bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900 dark:text-slate-200'}`}
              placeholder="exemplo@exemplo.com"
            />
            {(modoTI || alvoTemMarcaTI) && (
              <p id="um-email-dica" className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {alvoTemMarcaTI
                  ? 'E-mail, login e senha de quem administra usuários (TI): só o Edson troca (trocar um deles é tomar a conta e, com ela, a marca).'
                  : editingUserId
                  ? 'E-mail, login e senha de uma conta que já existe: só o Edson ou um GESTOR troca.'
                  : 'O da empresa (jimp.com.br, joinvilleimplementos.com.br ou furgoesjoinville.com.br; só o representante pode ter outro): é por ele que a pessoa recebe o código para criar a própria senha.'}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="um-phone" className="block text-sm font-medium text-black dark:text-white mb-1">Celular</label>
            <input
              id="um-phone"
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 dark:text-slate-200"
              placeholder="xx-xxxxx-xxxx"
            />
          </div>
          <div>
            <label htmlFor="um-username" className="block text-sm font-medium text-black dark:text-white mb-1">Nome de Usuário (Login)</label>
            <input
              id="um-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              readOnly={identidadeSoLeitura}
              className={`w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${identidadeSoLeitura ? 'bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900 dark:text-slate-200'}`}
              required
            />
          </div>
          {modoTI || alvoTemMarcaTI ? (
          <div>
            {/* Modo TI (032): nenhuma senha passa por aqui — nem na conta nova (o servidor sorteia uma que ninguém conhece e
                a pessoa cria a dela pelo código no e-mail) nem na que já existe. Na conta de quem administra usuários,
                a senha só o Edson troca (o GESTOR/COORDENADOR vê a nota, não o campo). */}
            <span className="block text-sm font-medium text-black dark:text-white mb-1">Senha</span>
            <p data-um="senha-nota" className="p-2 rounded-lg border border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 text-xs text-gray-600 dark:text-slate-300">
              {alvoTemMarcaTI
                ? 'A senha de quem administra usuários só o Edson troca; a própria pessoa cria uma nova pelo código no e-mail dela, em “Criar / redefinir senha”.'
                : editingUserId
                ? 'A senha é da pessoa: ela cria uma nova pelo código que chega no e-mail dela, em “Criar / redefinir senha”, na tela de entrada.'
                : 'Sem senha aqui: a pessoa cria a própria senha pelo código que chega no e-mail dela, em “Criar / redefinir senha”, na tela de entrada.'}
            </p>
          </div>
          ) : (
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Senha</label>
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 dark:text-slate-200"
              placeholder="Defina uma senha"
              // Só quando o Edson mexeu na caixa "Administra usuários (TI)" (032) a senha em branco vale ("manter a atual",
              // como o servidor já trata): dar ou tirar a marca não pode obrigar a regravar a senha da pessoa. O resto
              // segue como sempre (pendência antiga: o campo obrigatório também na edição).
              required={!(mostraCaixaAdminUsuarios && adminUsuariosTocado)}
            />
          </div>
          )}
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Função {(!isGestor && !modoTI) && <span className="text-xs text-gray-400 dark:text-slate-500">(Somente Gestor)</span>}</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              disabled={!isGestor && !modoTI}
              className={`w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${!isGestor && !modoTI ? 'bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900 dark:text-slate-200'}`}
            >
              {/* Modo TI (032, decisão do Edson 07/10): só os cargos comuns. GESTOR, COORDENADOR, CEO, Diretor e ADM Externo
                  (e as marcas de admin/visualizador do OKR) seguem com o Edson e o GESTOR. */}
              {modoTI ? cargosDoTIAqui.map(c => <option key={c} value={c}>{t(c.toLowerCase() as any)}</option>) : (<>
              <option value="PROJETISTA">{t('projetista')}</option>
              <option value="GESTOR">{t('gestor')}</option>
              <option value="CEO">{t('ceo')}</option>
              {/* Diretor Industrial (06/10/2026): "o mesmo privilégio e visualização do CEO" — quem dá é quem dá CEO (GESTOR). */}
              {(isGestor || role === 'DIRETOR_INDUSTRIAL') && (
                <option value="DIRETOR_INDUSTRIAL" disabled={!isGestor}>{t('diretor_industrial')}</option>
              )}
              <option value="COORDENADOR">{t('coordenador')}</option>
              <option value="PROCESSOS">{t('processos')}</option>
              {/* Representante (06/10/2026): vendedor de fora, sempre "Somente OKR" — só o GESTOR ou o Edson põe ou tira. */}
              {(podeDarRepresentante || role === 'REPRESENTANTE') && (
                <option value="REPRESENTANTE" disabled={!podeDarRepresentante}>{t('representante')}</option>
              )}
              {/* ADM Externo = admin de visualização do OKR: só o Edson/admin de OKR põe ou tira. */}
              {(canMarkOkrViewer || role === 'ADM_EXTERNO') && (
                <option value="ADM_EXTERNO" disabled={!canMarkOkrViewer}>{t('adm_externo')}</option>
              )}
              </>)}
            </select>
          </div>
          {/* Salário: o modo TI (032) nem vê o campo — "essa informação nunca está aberta para ele" (Edson, 07/10). */}
          {!modoTI && (
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Salário (R$) {(!isEdson) && <span className="text-xs text-gray-400 dark:text-slate-500">(Restrito)</span>}</label>
            <input
              type="text"
              value={!isEdson ? '' : (salary === 0 ? '' : salary)}
              onChange={e => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  setSalary(Number(val));
              }}
              disabled={!isEdson}
              className={`w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${!isEdson ? 'bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900 dark:text-slate-200'}`}
              placeholder={!isEdson ? '••••••' : 'Ex: 5000.00'}
            />
          </div>
          )}
          <div>
            <label htmlFor="um-sector" className="block text-sm font-medium text-black dark:text-white mb-1">Setor</label>
            <input
              id="um-sector"
              type="text"
              list="um-setores"
              value={representanteEfetivo ? setorDoRepresentante : sector}
              onChange={e => { setSector(e.target.value); setSetorTocado(true); }}
              disabled={!podeMudarSetor || representanteEfetivo || setorTravadoTI}
              className={`w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${!podeMudarSetor || representanteEfetivo || setorTravadoTI ? 'bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-500 cursor-not-allowed' : 'bg-white dark:bg-slate-900 dark:text-slate-200'}`}
              placeholder="Ex.: Comercial, PCP, RH, Fábrica"
            />
            <datalist id="um-setores">{setoresUsados.map(g => <option key={g} value={g} />)}</datalist>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {representanteEfetivo
                ? `O setor do representante é só dele (posto automaticamente): ele vê e lança só os indicadores dele.${setorCarregado.startsWith(PREFIXO_SETOR_REPRESENTANTE) ? ' Mudar o nome depois não muda o setor.' : ''}`
                : ehSetorDeRepresentante(sector)
                ? (setorTocado && sector.trim() !== setorCarregado
                  ? SETOR_DE_REPRESENTANTE_MSG
                  : `Este é o setor de um representante, que é só dele: ${podeMudarSetor ? 'dê à pessoa o setor novo dela.' : 'o Edson ou um admin de OKR dá o setor novo da pessoa.'}`)
                : setorTravadoTI || (modoTI && setorTocado && sector.trim() !== setorCarregado && setorVedadoAoTI(sector))
                ? SETOR_VEDADO_AO_TI_MSG
                : podeMudarSetor ? 'O setor abre o KPI do setor: a pessoa vê e lança os indicadores dele. Prefira um setor da lista.' : 'Só o Edson e os admins de OKR mudam o setor (ele abre o KPI do setor).'}
            </p>
          </div>
          {(isGestor || modoTI) && (
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={representanteEfetivo || (!viewerEfetivo && (okrEnabled || okrOnly))}
                disabled={representanteEfetivo || okrOnly || viewerEfetivo}
                onChange={e => setOkrEnabled(e.target.checked)}
                className="w-5 h-5 rounded accent-blue-600"
              />
              <span className="text-sm">
                <span className="font-semibold text-black dark:text-white">Habilitar OKR</span>
                <span className="block text-xs text-gray-500 dark:text-slate-400">Dá a ele a aba "Meu OKR" (editável) e a Agenda. O Edson vê e edita o de todos.</span>
              </span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={representanteEfetivo || (!viewerEfetivo && okrOnly)}
                disabled={representanteEfetivo || viewerEfetivo}
                onChange={e => { setOkrOnly(e.target.checked); if (e.target.checked) setOkrEnabled(true); }}
                className="w-5 h-5 rounded accent-amber-600"
              />
              <span className="text-sm">
                <span className="font-semibold text-black dark:text-white">Somente OKR</span>
                <span className="block text-xs text-gray-500 dark:text-slate-400">{representanteEfetivo ? 'O representante é sempre "Somente OKR": o OKR, a Agenda e os indicadores dele — nada de engenharia.' : 'Ele vê SÓ a aba OKR — nada de engenharia (dashboard, projetos, etc.).'}</span>
              </span>
            </label>
            {canMarkOkrViewer && editingUserId !== EDSON_UUID && (
            <label className="md:col-span-2 flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={viewerEfetivo}
                disabled={role === 'ADM_EXTERNO' || representanteEfetivo}
                onChange={e => { setOkrViewer(e.target.checked); if (e.target.checked) { setOkrEnabled(false); setOkrOnly(false); } }}
                className="w-5 h-5 rounded accent-violet-600"
              />
              <span className="text-sm">
                <span className="font-semibold text-black dark:text-white">Admin de visualização do OKR</span>
                <span className="block text-xs text-gray-500 dark:text-slate-400">Vê os Indicadores e a Linha do tempo de todos, sem alterar nada. Não tem OKR próprio nem vê engenharia.</span>
              </span>
            </label>
            )}
          </div>
          )}
          {/* "Administra usuários (TI)" (032, decisão do Edson 07/10/2026): só o Edson dá ou tira, no editar de outra pessoa. */}
          {mostraCaixaAdminUsuarios && (
          <label data-um="caixa-admin-usuarios" className="md:col-span-2 flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 cursor-pointer">
            <input
              type="checkbox"
              checked={adminUsuariosMarca}
              ref={el => { if (el) el.indeterminate = marcaAdminUsuariosDesconhecida && !adminUsuariosTocado; }}
              onChange={e => { setAdminUsuariosMarca(e.target.checked); setAdminUsuariosTocado(true); }}
              disabled={!cargoAceitaMarcaTI && !adminUsuariosMarca && !marcaAdminUsuariosDesconhecida}
              className="w-5 h-5 rounded accent-emerald-600"
            />
            <span className="text-sm">
              <span className="font-semibold text-black dark:text-white">Administra usuários (TI)</span>
              <span className="block text-xs text-gray-500 dark:text-slate-400">Abre a Equipe para criar, editar (só cargos comuns; e-mail, login e senha de conta que já existe, não) e excluir ou desligar usuários — menos você e o teste. Nunca vê salário nem R$. Vale a partir do próximo login da pessoa.</span>
              {!cargoAceitaMarcaTI && (
                <span className="block text-xs text-amber-700 dark:text-amber-400 mt-0.5">A marca só vale em Projetista, Processos ou Qualidade (sem visualizador){adminUsuariosMarca ? ': desmarque antes de mudar o cargo.' : '.'}</span>
              )}
              {marcaAdminUsuariosDesconhecida && !adminUsuariosTocado && (
                <span className="block text-xs text-amber-700 dark:text-amber-400 mt-0.5">Não consegui ler a marca de hoje (a 032 já rodou?). Marcar ou desmarcar grava o que você escolher.</span>
              )}
            </span>
          </label>
          )}
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isRegistering}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center"
            >
              {isRegistering ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              {isRegistering ? (editingUserId ? 'Salvando...' : 'Cadastrando...') : (editingUserId ? 'Salvar Alterações' : 'Cadastrar')}
            </button>
          </div>
        </form>
      </div>
      )}

      {/* Users List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
           <h3 className="font-bold text-black dark:text-white">Membros da Equipe</h3>
           {loadingList && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>
        
        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-800">
           {users.length === 0 && !loadingList && (
             <div className="p-8 text-center text-gray-400 dark:text-slate-500 italic block">Nenhum usuário encontrado.</div>
           )}
           {users.map((u) => {
              const canEditThisUser = canEditUser(u);
              return (
                <div key={u.id} className={`p-4 ${currentUser.id === u.id ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-lg">
                                {u.name.charAt(0)}
                            </div>
                            <div>
                                <h4 className="font-black text-gray-900 dark:text-white uppercase">{u.name} {u.surname}</h4>
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider">@{u.username}</span>
                                    {currentUser.id === u.id && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-black uppercase bg-blue-50 dark:bg-blue-900/30 px-1.5 rounded">Você</span>}
                                </div>
                                {ultimoDiaTrabalhado(u) && <div className="mt-1">{seloDesligado(u)}</div>}
                            </div>
                        </div>
                        <div className="flex bg-gray-50 dark:bg-slate-800 p-1.5 rounded-lg gap-1 border border-gray-200 dark:border-slate-700">
                           {canEditThisUser && (
                            <button onClick={() => handleEdit(u)} className="p-1.5 text-indigo-600 dark:text-indigo-400"><Edit className="w-4 h-4" /></button>
                           )}
                           {/* Modo TI (032): no lugar do Editar, o cadeado com o porquê. */}
                           {!canEditThisUser && porqueNaoEdita(u) && (
                            <button type="button" data-um="cadeado" onClick={() => addToast(porqueNaoEdita(u)!, 'info')} className="p-1.5 text-gray-400 dark:text-slate-500" title={porqueNaoEdita(u)!} aria-label={porqueNaoEdita(u)!}><Lock className="w-4 h-4" /></button>
                           )}
                           {canDesligarUser(u) && (
                            <button onClick={() => abrirDesligar(u)} className="p-1.5 text-amber-600 dark:text-amber-400" title="Desligar" aria-label={`Desligar ${u.name}`}><UserX className="w-4 h-4" /></button>
                           )}
                           {canDeleteUser(u) && (
                            <button onClick={() => handleDelete(u)} className="p-1.5 text-red-600 dark:text-red-400"><Trash2 className="w-4 h-4" /></button>
                           )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-3 mb-2">
                        <div>
                            <span className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Função</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 inline-flex items-center gap-1 border border-gray-200 dark:border-slate-700">
                                {getRoleIcon(u.role)}
                                {t(u.role.toLowerCase() as any)}
                            </span>
                        </div>
                        {/* O modo TI (032) não tem a coluna de salário, nem mascarada. */}
                        {!modoTI && (
                        <div>
                            <span className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Salário</span>
                            <span className="text-xs font-black text-gray-800 dark:text-slate-200">
                                {isEdson
                                ? (u.salary ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(u.salary) : '-')
                                : '***'}
                            </span>
                        </div>
                        )}
                        <div className="col-span-2">
                             <span className="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Contato</span>
                             <div className="text-[11px] font-medium text-gray-700 dark:text-slate-300 truncate">{u.email || '-'}</div>
                             <div className="text-[10px] text-gray-500 font-bold">{u.phone || '-'}</div>
                        </div>
                    </div>
                </div>
              )
           })}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[800px]">
          <thead className="bg-gray-50 dark:bg-slate-900 text-black dark:text-white font-medium">
            <tr>
              <th className="p-4">Nome</th>
              <th className="p-4">Usuário</th>
              <th className="p-4">E-mail / Celular</th>
              <th className="p-4">Senha</th>
              <th className="p-4">Função</th>
              {!modoTI && <th className="p-4">Salário</th>}
              <th className="p-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {users.map((u) => {
              const canEditThisUser = canEditUser(u);
              const canDeleteThisUser = canDeleteUser(u); // o GESTOR (todos, como sempre) e o modo TI (032: menos o Edson, o teste e a própria)
              const canDesligarThisUser = canDesligarUser(u);
              const porqueNaoEditaEste = canEditThisUser ? null : porqueNaoEdita(u);
              const showActions = canEditThisUser || canDeleteThisUser || canDesligarThisUser || !!porqueNaoEditaEste;

              return (
              <tr key={u.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 ${currentUser.id === u.id ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}>
                <td className="p-4 font-medium text-black dark:text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-900 flex items-center justify-center text-gray-500 dark:text-slate-400 font-bold flex-shrink-0">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold">{u.name} {u.surname}</div>
                      {currentUser.id === u.id && <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">Você</span>}
                      {ultimoDiaTrabalhado(u) && <div className="mt-1">{seloDesligado(u)}</div>}
                    </div>
                  </div>
                </td>
                <td className="p-4 text-black dark:text-white">{u.username}</td>
                <td className="p-4 text-black dark:text-white">
                  <div className="text-xs">{u.email || '-'}</div>
                  <div className="text-[10px] text-gray-500 dark:text-slate-400">{u.phone || '-'}</div>
                </td>
                <td className="p-4 text-gray-400 dark:text-slate-500 font-mono text-xs">
                  {/* Senha nunca mais trafega em texto puro (C2). Fica com hash no banco. */}
                  ••••••
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold flex items-center w-fit gap-1 bg-gray-100 dark:bg-slate-900 text-black dark:text-white`}>
                    {getRoleIcon(u.role)}
                    {t(u.role.toLowerCase() as any)}
                  </span>
                </td>
                {/* Salário: só o Edson vê o valor; o modo TI (032) não tem a coluna. */}
                {!modoTI && (
                <td className="p-4 text-black dark:text-white">
                  {isEdson
                    ? (u.salary ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(u.salary) : '-')
                    : '***'}
                </td>
                )}
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {canEditThisUser && (
                    <button
                      onClick={() => handleEdit(u)}
                      className="text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded transition"
                      title="Editar Usuário"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    )}
                    {porqueNaoEditaEste && (
                    <button type="button" data-um="cadeado" onClick={() => addToast(porqueNaoEditaEste, 'info')} className="text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 p-2 rounded cursor-help" title={porqueNaoEditaEste} aria-label={porqueNaoEditaEste}>
                      <Lock className="w-4 h-4" />
                    </button>
                    )}
                    {canDesligarThisUser && (
                    <button
                      onClick={() => abrirDesligar(u)}
                      className="text-gray-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 p-2 rounded transition"
                      title="Desligar (mantém o histórico)"
                      aria-label={`Desligar ${u.name}`}
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                    )}
                    {canDeleteThisUser && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded transition"
                      title="Excluir Usuário"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    )}
                    {!showActions && <span className="text-gray-300 dark:text-slate-600">-</span>}
                  </div>
                </td>
              </tr>
            )})}
            {!loadingList && users.length === 0 && (
              <tr>
                <td colSpan={modoTI ? 6 : 7} className="p-4 text-center text-gray-400 dark:text-slate-500">Nenhum usuário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      {/* Data Maintenance Section - GESTOR ONLY */}
      {currentUser.role === 'GESTOR' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-orange-100 dark:border-orange-900/30 mt-8">
            <h3 className="font-bold text-black dark:text-white mb-4 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" />
            Manutenção de Dados & Permissões
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Excel Integration */}
                <div className="p-4 bg-green-50 dark:bg-emerald-900/20 rounded-lg border border-green-200 dark:border-emerald-900/30">
                    <h4 className="font-semibold text-black dark:text-white mb-2 flex items-center">
                        <Activity className="w-5 h-5 mr-2" />
                        Integração com Excel Online
                    </h4>
                    <p className="text-sm text-green-700 dark:text-emerald-500/80 mb-4">
                        Configure um Webhook (Power Automate) para enviar dados automaticamente para sua planilha Excel ao concluir projetos.
                    </p>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-green-800 dark:text-emerald-400 uppercase">URL do Webhook</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://prod-XX.westus.logic.azure.com:443/workflows/..."
                                className="flex-1 p-2 border border-green-300 dark:border-emerald-900/50 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-slate-900 dark:text-slate-200"
                            />
                            <button 
                                onClick={handleSaveWebhook}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-bold"
                            >
                                {t('save')}
                            </button>
                        </div>
                        <button 
                            onClick={() => setShowWebhookHelp(!showWebhookHelp)}
                            className="text-xs text-green-600 dark:text-emerald-500 underline hover:text-green-800 dark:hover:text-emerald-400 mt-1"
                        >
                            {t('howToConfigureThis')}
                        </button>
                        
                        {showWebhookHelp && (
                            <div className="mt-4 bg-white dark:bg-slate-900 p-4 rounded border border-green-200 dark:border-emerald-900/30 text-sm text-gray-600 dark:text-slate-400 space-y-2">
                                <p><strong>{t('stepByStepPowerAutomate')}</strong></p>
                                <ol className="list-decimal pl-5 space-y-1">
                                    <li>{t('excelWebhookHelpLine1')}</li>
                                    <li>{t('excelWebhookHelpLine2')}</li>
                                    <li>{t('excelWebhookHelpLine3')}
                                        <pre className="bg-gray-100 dark:bg-slate-900 p-2 rounded mt-1 text-xs font-mono dark:text-slate-300">
{`{
  "projetista": "Nome",
  "ns": "123456",
  "tipo_produto": "Furgão",
  "data_conclusao": "DD/MM/AAAA",
  "hora_conclusao": "HH:MM",
  "mes_referencia": "março"
}`}
                                        </pre>
                                    </li>
                                    <li>{t('excelWebhookHelpLine4')}</li>
                                    <li><strong>{t('excelWebhookHelpLine5')}</strong></li>
                                    <li>{t('excelWebhookHelpLine6')}</li>
                                    <li>{t('webhookUrlSavedSuccess')}</li>
                                </ol>
                            </div>
                        )}
                    </div>
                </div>

                {/* Remove Duplicates */}
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-900/30">
                    <h4 className="font-semibold text-black dark:text-white mb-2">{t('removeDuplicateProjects')}</h4>
                    <p className="text-sm text-orange-600 dark:text-orange-500/80 mb-4">
                        {t('removeDuplicateProjectsDesc')}
                    </p>
                    <button 
                        onClick={async () => {
                            addToast(t('searchingDuplicates'), "info");
                            setIsCleaning(true);
                            
                            try {
                                const res = await findDuplicateProjects();
                                if (res.success) {
                                    if (res.duplicates.length > 0) {
                                        setDuplicateGroups(res.duplicates);
                                        setShowDuplicateModal(true);
                                        addToast(t('duplicateFoundCount', { count: res.duplicates.length }), "success");
                                    } else {
                                        addToast(t('noDuplicatesFound'), "success");
                                    }
                                } else {
                                    addToast(t('error') + ": " + res.message, "error");
                                }
                            } catch (e) {
                                addToast(t('errorGeneric'), "error");
                            } finally {
                                setIsCleaning(false);
                            }
                        }}
                        disabled={isCleaning}
                        className="bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        {isCleaning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        {t('searchDuplicatesButton' as any) || 'Buscar Duplicatas'}
                    </button>
                </div>

                {/* Recalculate Costs */}
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-900/30">
                    <h4 className="font-semibold text-black dark:text-white mb-2 flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-indigo-600" />
                        {t('updateProjectValues' as any) || 'Atualizar Valores de Projetos'}
                    </h4>
                    <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-4">
                        {t('recalculateCostsDesc' as any) || 'Recalcula o custo de todos os projetos no banco de dados usando a regra atual.'}
                    </p>
                    <button 
                        onClick={async () => {
                            if(!window.confirm(t('confirmRecalculateAllCosts'))) return;
                            setIsRecalculating(true);
                            const res = await recalculateAllProjectCosts();
                            setIsRecalculating(false);
                            if(res.success) {
                                addToast(res.message, "success");
                                // Audit Log
                                addAuditLog({
                                    userId: currentUser.id,
                                    userName: currentUser.name,
                                    action: 'UPDATE',
                                    entityType: 'SYSTEM',
                                    entityId: 'recalculate_costs',
                                    entityName: 'Recalcular Custos',
                                    details: `Recálculo total de custos de projetos executado por ${currentUser.name}. Resultado: ${res.message}`
                                });
                            }
                            else addToast(t('error') + ": " + res.message, "error");
                        }}
                        disabled={isRecalculating}
                        className="bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
                        {t('recalculateAndSyncButton' as any) || 'Recalcular e Sincronizar Custos'}
                    </button>
                </div>

                {/* COMPREHENSIVE SQL FIX — desligado (ver MOSTRAR_CORRECAO_TOTAL) */}
                {MOSTRAR_CORRECAO_TOTAL && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-900/30 md:col-span-2">
                    <h4 className="font-bold text-red-700 dark:text-red-400 mb-2 flex items-center uppercase tracking-tighter">
                        <Shield className="w-5 h-5 mr-2" />
                        Deseja corrigir erros de Banco de Dados? (Correção TOTAL)
                    </h4>
                    <p className="text-sm text-red-600 dark:text-red-500/80 mb-4 font-medium">
                        Se você está vendo erros como "innovations_type_check", "users_role_check" ou se não consegue adicionar tarefas no Diagrama de Gantt, use este botão para obter o script de correção abrangente.
                    </p>
                    <button 
                        onClick={() => setShowFixModal(true)}
                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg shadow-red-200 dark:shadow-none transition-all flex items-center gap-2"
                    >
                        <Database className="w-5 h-5" />
                        OBTER SCRIPT DE CORREÇÃO TOTAL
                    </button>
                </div>
                )}
            </div>
        </div>
      )}

      {/* SQL FIX MODAL */}
      {showFixModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm shadow-2xl">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-red-600 text-white shadow-sm">
                    <div className="flex items-center gap-3">
                        <Database className="w-6 h-6" />
                        <h3 className="text-lg font-bold uppercase tracking-tight">Script de Correção Total</h3>
                    </div>
                    <button onClick={() => setShowFixModal(false)} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 p-4 text-sm text-amber-800 dark:text-amber-300 rounded-r-lg">
                        <p className="font-bold mb-1 uppercase tracking-wide">Como aplicar:</p>
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Copie o código SQL abaixo.</li>
                            <li>Vá para o <strong>SQL Editor</strong> de seu painel Supabase.</li>
                            <li>Cole o código e clique em <strong>RUN</strong>.</li>
                        </ol>
                    </div>
                    
                    <div className="relative group">
                        <button 
                            onClick={() => {
                                const sqlCode = document.getElementById('sql-code-display')?.innerText;
                                if (sqlCode) {
                                  navigator.clipboard.writeText(sqlCode);
                                  addToast("Script copiado com sucesso!", "success");
                                }
                            }}
                            className="absolute right-4 top-4 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-[10px] font-bold z-10"
                        >
                            <Copy size={14} /> COPIAR SCRIPT
                        </button>
                        <div 
                            id="sql-code-display"
                            className="bg-slate-950 text-emerald-400 p-6 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed border border-slate-800 h-96 select-all shadow-inner custom-scrollbar"
                        >
{`-- CORREÇÃO TOTAL DO BANCO DE DADOS (VERSÃO COMPLETA 2026)
-- Execute este script no SQL Editor do seu Supabase (https://supabase.com/dashboard/project/_/sql)

-- 1. DROPS PREVENTIVOS
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.innovations DROP CONSTRAINT IF EXISTS innovations_type_check;

-- 2. Atualizar Cargos Permitidos
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
CHECK (role IN ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR', 'ADM_EXTERNO', 'DIRETOR_INDUSTRIAL', 'REPRESENTANTE'));

-- 3. Garantir que as colunas necessárias existem na tabela de projetos
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_code text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS flooring_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS implement_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS estimated_seconds integer;
ALTER TABLE public.operational_activities ADD COLUMN IF NOT EXISTS is_overtime boolean default false;

-- 4. Tabela de Inovações (Garantir colunas novas)
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS productivity_before numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS productivity_after numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS unit_product_cost numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS unit_product_value numeric DEFAULT 0;

-- 5. NORMALIZAÇÃO DE DADOS AGRESSIVA (Limpa antes de travar a porta)
-- Normalizar Tipos de Inovação
UPDATE public.innovations SET type = 'NEW_PROJECT' WHERE UPPER(type) IN ('NOVO PROJETO', 'NEW PROJECT', 'NEW_PROJECT', 'NOVO_PROJETO');
UPDATE public.innovations SET type = 'PRODUCT_IMPROVEMENT' WHERE UPPER(type) IN ('MELHORIA DE PRODUTO', 'PRODUCT IMPROVEMENT', 'PRODUCT_IMPROVEMENT', 'MELHORIA_DE_PRODUTO');
UPDATE public.innovations SET type = 'PROCESS_OPTIMIZATION' WHERE UPPER(type) IN ('OTIMIZAÇÃO DE PROCESSOS', 'PROCESS OPTIMIZATION', 'PROCESS_OPTIMIZATION', 'OTIMIZACAO_DE_PROCESSOS');

-- Qualquer tipo remanescente que não bata vira 'PRODUCT_IMPROVEMENT' para evitar erro
UPDATE public.innovations 
SET type = 'PRODUCT_IMPROVEMENT' 
WHERE type NOT IN ('NEW_PROJECT', 'PRODUCT_IMPROVEMENT', 'PROCESS_OPTIMIZATION', 'NOVO PROJETO', 'MELHORIA DE PRODUTO', 'OTIMIZAÇÃO DE PROCESSOS');

-- Normalizar Métodos de Cálculo
ALTER TABLE public.innovations DROP CONSTRAINT IF EXISTS innovations_calculation_type_check;
UPDATE public.innovations SET calculation_type = 'PER_UNIT' WHERE calculation_type IN ('POR UNIDADE PRODUZIDA', 'PER UNIT', 'PER_UNIT');
UPDATE public.innovations SET calculation_type = 'RECURRING_MONTHLY' WHERE calculation_type IN ('RECORRENTE (MENSUAL)', 'RECURRING MONTHLY', 'RECURRING_MONTHLY');
UPDATE public.innovations SET calculation_type = 'ONE_TIME' WHERE calculation_type IN ('VALOR ÚNICO / FIXO', 'ONE TIME', 'ONE_TIME');
UPDATE public.innovations SET calculation_type = 'ADD_EXPENSE' WHERE calculation_type IN ('ADICIONAR GASTO', 'ADD EXPENSE', 'ADD_EXPENSE');

-- Qualquer método de cálculo remanescente ou NULL que não bata vira 'RECURRING_MONTHLY' para evitar erro fatal
UPDATE public.innovations 
SET calculation_type = 'RECURRING_MONTHLY' 
WHERE calculation_type IS NULL OR calculation_type NOT IN ('PER_UNIT', 'RECURRING_MONTHLY', 'ONE_TIME', 'ADD_EXPENSE', 'POR UNIDADE PRODUZIDA', 'RECORRENTE (MENSUAL)', 'VALOR ÚNICO / FIXO', 'ADICIONAR GASTO');

-- 6. REATIVAR CONSTRAINTS DE INOVAÇÕES
ALTER TABLE public.innovations ADD CONSTRAINT innovations_type_check 
CHECK (type IN ('NEW_PROJECT', 'PRODUCT_IMPROVEMENT', 'PROCESS_OPTIMIZATION', 'NOVO PROJETO', 'MELHORIA DE PRODUTO', 'OTIMIZAÇÃO DE PROCESSOS'));

ALTER TABLE public.innovations ADD CONSTRAINT innovations_calculation_type_check
CHECK (calculation_type IN ('PER_UNIT', 'RECURRING_MONTHLY', 'ONE_TIME', 'ADD_EXPENSE', 'POR UNIDADE PRODUZIDA', 'RECORRENTE (MENSUAL)', 'VALOR ÚNICO / FIXO', 'ADICIONAR GASTO'));

-- 7. Tabela de Gantt (Project Nexus)
CREATE TABLE IF NOT EXISTS public.gantt_tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.gantt_tasks(id) ON DELETE CASCADE,
  start_date text NOT NULL,
  end_date text NOT NULL,
  color text,
  is_milestone boolean DEFAULT false,
  assigned_to jsonb DEFAULT '[]'::jsonb,
  progress integer DEFAULT 0,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  workload jsonb DEFAULT '{}'::jsonb,
  reports text,
  "order" integer DEFAULT 0,
  status text DEFAULT 'todo',
  priority text DEFAULT 'medium',
  category text,
  dependencies jsonb DEFAULT '[]'::jsonb,
  tenant_id uuid
);

-- 8. Tabela de Logs de Auditoria (Audit Log)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid,
  user_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_name text,
  timestamp timestamptz DEFAULT now(),
  details text,
  ip_address text
);

-- Garantir que a coluna de IP existe se a tabela já foi criada anteriormente
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address text;

-- Habilitar RLS para Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive Audit Select" ON public.audit_logs;
CREATE POLICY "Permissive Audit Select" ON public.audit_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permissive Audit Insert" ON public.audit_logs;
CREATE POLICY "Permissive Audit Insert" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- Habilitar RLS para Gantt
ALTER TABLE public.gantt_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive Gantt Select" ON public.gantt_tasks;
CREATE POLICY "Permissive Gantt Select" ON public.gantt_tasks FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permissive Gantt All" ON public.gantt_tasks;
CREATE POLICY "Permissive Gantt All" ON public.gantt_tasks FOR ALL USING (true);

-- 9. Desativar RLS para Tabelas Operacionais para compatibilidade total com login customizado
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interruption_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interruptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_requests DISABLE ROW LEVEL SECURITY;

-- Políticas de Fallback Permissivas caso o usuário reabilite RLS manualmente
DROP POLICY IF EXISTS "Permissive Select Projects" ON public.projects;
DROP POLICY IF EXISTS "Permissive Insert Projects" ON public.projects;
DROP POLICY IF EXISTS "Permissive Update Projects" ON public.projects;
DROP POLICY IF EXISTS "Permissive Delete Projects" ON public.projects;
CREATE POLICY "Permissive Select Projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Permissive Insert Projects" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Permissive Update Projects" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "Permissive Delete Projects" ON public.projects FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permissive Select Operational Activities" ON public.operational_activities;
DROP POLICY IF EXISTS "Permissive Insert Operational Activities" ON public.operational_activities;
DROP POLICY IF EXISTS "Permissive Update Operational Activities" ON public.operational_activities;
DROP POLICY IF EXISTS "Permissive Delete Operational Activities" ON public.operational_activities;
CREATE POLICY "Permissive Select Operational Activities" ON public.operational_activities FOR SELECT USING (true);
CREATE POLICY "Permissive Insert Operational Activities" ON public.operational_activities FOR INSERT WITH CHECK (true);
CREATE POLICY "Permissive Update Operational Activities" ON public.operational_activities FOR UPDATE USING (true);
CREATE POLICY "Permissive Delete Operational Activities" ON public.operational_activities FOR DELETE USING (true);

DROP POLICY IF EXISTS "Permissive Select Interruptions" ON public.interruptions;
DROP POLICY IF EXISTS "Permissive Insert Interruptions" ON public.interruptions;
DROP POLICY IF EXISTS "Permissive Update Interruptions" ON public.interruptions;
DROP POLICY IF EXISTS "Permissive Delete Interruptions" ON public.interruptions;
CREATE POLICY "Permissive Select Interruptions" ON public.interruptions FOR SELECT USING (true);
CREATE POLICY "Permissive Insert Interruptions" ON public.interruptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Permissive Update Interruptions" ON public.interruptions FOR UPDATE USING (true);
CREATE POLICY "Permissive Delete Interruptions" ON public.interruptions FOR DELETE USING (true);

-- 10. Recarregar Schema
NOTIFY pgrst, 'reload config';`}
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-500 italic mt-2">
                        * Este script não apaga dados existentes, apenas adiciona permissões e colunas faltantes.
                    </p>
                </div>
                
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
                    <button 
                        onClick={() => setShowFixModal(false)}
                        className="px-6 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
                    >
                        FECHAR
                    </button>
                </div>
            </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirmationUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-slate-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-2">{t('confirmDeletion')}</h3>
                <p className="text-gray-600 dark:text-slate-400 mb-6">
                    {t('confirmDeletionDesc', { name: deleteConfirmationUser.name })}
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setDeleteConfirmationUser(null)}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-900 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                    >
                        {t('cancel')}
                    </button>
                    <button 
                        onClick={confirmDelete}
                        className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        {t('yesDelete')}
                    </button>
                </div>
            </div>
        </div>
      )}
      {/* Desligar — decisão do Edson, 30/09/2026: desligar, não excluir */}
      {desligarAlvo && (
        <Dialog
          onClose={fecharDesligar}
          label={`Desligar ${desligarAlvo.name}`}
          zClassName="z-50"
          panelClassName="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-slate-700 border-l-4 border-l-amber-500 outline-none"
        >
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gray-400 dark:text-slate-500 mb-0.5">Equipe · <span className="text-orange-500 dark:text-orange-400">Desligar</span></p>
          <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-2 flex items-center">
            <UserX className="w-5 h-5 mr-2 text-amber-600 dark:text-amber-400" />
            Desligar {desligarAlvo.name} {desligarAlvo.surname || ''}
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
            {modoTI
              ? 'Tira o acesso (senha e e-mail) e mantém todo o histórico no nome dele. Não se desfaz pela tela.'
              : 'Tira o acesso (senha e e-mail), mantém todo o histórico no nome dele e tira o salário do custo/hora a partir do dia seguinte. Não se desfaz pela tela.'}
          </p>
          <label htmlFor="um-desligar-dia" className="block text-sm font-medium text-black dark:text-white mb-1">Último dia trabalhado</label>
          <input
            id="um-desligar-dia"
            type="date"
            value={desligarDia}
            min={DESLIGAR_DESDE}
            max={hojeJoinville()}
            onChange={e => { setDesligarDia(e.target.value); setDesligarErro(''); }}
            disabled={isDesligando}
            className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-slate-900 dark:text-slate-200"
          />
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
            {modoTI
              ? 'O último dia trabalhado fica registrado no nome da pessoa (não pode ser no futuro).'
              : 'No último dia a pessoa ainda conta. Se o último dia for de um mês já fechado, o custo só muda a partir do 1º dia deste mês (mês fechado não muda).'}
          </p>
          {desligarErro && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {desligarErro}
            </p>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={fecharDesligar}
              disabled={isDesligando}
              className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={confirmarDesligar}
              disabled={isDesligando || !desligarDia}
              className="px-4 py-2 text-white bg-amber-600 hover:bg-amber-700 rounded-lg font-medium transition-colors shadow-sm flex items-center disabled:opacity-60"
            >
              {isDesligando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserX className="w-4 h-4 mr-2" />}
              {isDesligando ? 'Desligando...' : 'Desligar'}
            </button>
          </div>
        </Dialog>
      )}
      {/* Duplicate Resolution Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] flex flex-col border border-gray-100 dark:border-slate-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center">
                        <AlertCircle className="w-6 h-6 mr-2 text-orange-600 dark:text-orange-400" />
                        {t('resolveDuplicates', { count: duplicateGroups.length })}
                    </h3>
                    <button onClick={() => setShowDuplicateModal(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="overflow-y-auto flex-1 space-y-4 pr-2">
                    {duplicateGroups.map((group, idx) => (
                        <div key={idx} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-slate-900 grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                            {/* Keep */}
                            <div className="bg-white dark:bg-slate-900 p-3 rounded border border-green-200 dark:border-emerald-900/30 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-green-100 dark:bg-emerald-900/40 text-green-800 dark:text-emerald-400 text-xs font-bold px-2 py-1 rounded">{t('keep')}</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">ID: ...{group.keep.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.keep.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.keep.clientName || t('noClient')}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>{t('start')}: {new Date(group.keep.startTime).toLocaleString()}</p>
                                    <p>{t('timeCol' as any) || 'Tempo'}: {(group.keep.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>{t('statusLabel' as any) || 'Status'}: {group.keep.status}</p>
                                </div>
                            </div>

                            {/* Discard */}
                            <div className="bg-white dark:bg-slate-900 p-3 rounded border border-red-200 dark:border-red-900/30 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-400 text-xs font-bold px-2 py-1 rounded">{t('discard')}</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">ID: ...{group.discard.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.discard.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.discard.clientName || t('noClient')}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>{t('start')}: {new Date(group.discard.startTime).toLocaleString()}</p>
                                    <p>{t('timeCol' as any) || 'Tempo'}: {(group.discard.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>{t('statusLabel' as any) || 'Status'}: {group.discard.status}</p>
                                </div>
                                <button 
                                    onClick={async () => {
                                        if(!window.confirm(t('confirmDeletion'))) return;
                                        const res = await deleteProjectById(group.discard.id, group.discard.ns);
                                        if (res.success) {
                                            // Pop-up requested by user
                                            window.alert(t('projectDeletedSuccess' as any) || "PROJETO EXCLUÍDO COM SUCESSO!");
                                            
                                            // Audit Log
                                            addAuditLog({
                                                userId: currentUser.id,
                                                userName: currentUser.name,
                                                action: 'DELETE',
                                                entityType: 'PROJECT',
                                                entityId: group.discard.id,
                                                entityName: group.discard.ns,
                                                details: `Duplicata do projeto ${group.discard.ns} removida por ${currentUser.name}`
                                            });

                                            // Update UI instantly without reload
                                            setDuplicateGroups(prev => prev.filter(g => g.discard.id !== group.discard.id));
                                        } else {
                                            addToast(t('errorPrefix') + res.message, "error");
                                            window.alert((t('errorPrefix') + res.message).toUpperCase());
                                        }
                                    }}
                                    className="mt-3 w-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/30 py-1 rounded text-xs font-bold flex items-center justify-center"
                                >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    {t('deleteThis')}
                                </button>
                            </div>
                            
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-full p-1 border border-gray-200 dark:border-slate-700 shadow-sm z-10 hidden md:block">
                                <div className="text-gray-400 dark:text-slate-500 text-xs font-bold">VS</div>
                            </div>
                        </div>
                    ))}
                    {duplicateGroups.length === 0 && (
                        <div className="text-center py-10 text-gray-500 dark:text-slate-400">
                            <CheckCircle className="w-12 h-12 mx-auto text-green-500 dark:text-emerald-500 mb-3" />
                            <p>{t('allDuplicatesResolved')}</p>
                        </div>
                    )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 flex justify-end">
                    <button 
                        onClick={() => {
                            setShowDuplicateModal(false);
                            window.location.reload();
                        }}
                        className="px-4 py-2 bg-gray-800 dark:bg-slate-900 hover:bg-gray-900 dark:hover:bg-slate-600 text-white rounded-lg font-medium text-sm"
                    >
                        {t('closeAndUpdate')}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
