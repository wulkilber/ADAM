/* IFAM MVP — internal functions end in _ and cannot be called with google.script.run. */
var SCHEMA_={
 Alunos:['id','nome','matricula','curso','turma','ativo','criadoEm','atualizadoEm','criadoPor','versao'],
 Usuarios:['id','nome','email','perfil','ativo','criadoEm','atualizadoEm'],
 Ocorrencias:['id','alunoId','anoLetivo','dataHoraAbordagem','registradoEm','assistenteId','irregularidadesJson','observacao','status','operacaoId'],
 Encaminhamentos:['id','alunoId','anoLetivo','ocorrenciaIdsJson','status','criadoEm','encaminhadoEm','encaminhadoPor','concluidoEm','concluidoPor','observacaoEncaminhamento','observacaoConclusao','snapshotJson','versao','operacaoId'],
 AnosLetivos:['ano','ativoParaRegistro','criadoEm'],Configuracoes:['chave','valor','atualizadoEm'],
 Operacoes:['id','usuarioId','tipo','chaveIdempotencia','payloadHash','estado','planoJson','resultadoJson','criadoEm','atualizadoEm'],
 Auditoria:['id','operacaoId','usuarioId','acao','entidade','entidadeId','dataHora','detalhesJson']
};
function spreadsheet_(){var id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');if(!id)IFAM.fail('SERVICE_UNAVAILABLE','Configure SPREADSHEET_ID no projeto.');return SpreadsheetApp.openById(id)}
function now_(){return new Date().toISOString()}
function readTable_(name){var sh=spreadsheet_().getSheetByName(name);if(!sh)IFAM.fail('SERVICE_UNAVAILABLE','Execute o setup administrativo.');var rows=sh.getDataRange().getDisplayValues();if(JSON.stringify(rows[0])!==JSON.stringify(SCHEMA_[name]))IFAM.fail('SERVICE_UNAVAILABLE','Esquema de planilha incompatível.');return rows.slice(1).filter(r=>r.some(v=>v!=='')).map(r=>{var o={};SCHEMA_[name].forEach((k,i)=>{var v=r[i];if(['ativo','ativoParaRegistro'].includes(k))v=String(v).toLowerCase()==='true';if(['versao','ano','anoLetivo'].includes(k))v=Number(v);o[k]=v});return o})}
function safeCell_(v){if(v===undefined||v===null)return '';var s=String(v);return /^[=+@\-\t\r\n']/.test(s)?"'"+s:s}
function upsert_(name,row){var sh=spreadsheet_().getSheetByName(name),key=SCHEMA_[name][0],all=readTable_(name),i=all.findIndex(x=>String(x[key])===String(row[key])),line=i<0?sh.getLastRow()+1:i+2;var range=sh.getRange(line,1,1,SCHEMA_[name].length);range.setNumberFormat('@');range.setValues([SCHEMA_[name].map(k=>safeCell_(row[k]))]);SpreadsheetApp.flush()}
function loadDb_(){var d={};Object.keys(SCHEMA_).forEach(n=>d[n]=readTable_(n));return d}
function auth_(){var email=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();if(!email)IFAM.fail('UNAUTHENTICATED','Sua identidade Google não está disponível. Solicite a configuração institucional do acesso.');var u=readTable_('Usuarios').find(u=>u.email.toLowerCase()===email);IFAM.allow(u,'read');return u}
function config_(){var c={campus:'Campus a definir',fusoHorario:'America/Manaus',politicaAposLimite:'PENDENTE_DEFINICAO'};readTable_('Configuracoes').forEach(r=>c[r.chave]=r.valor);var ys=readTable_('AnosLetivos').filter(y=>y.ativoParaRegistro);if(ys.length!==1)IFAM.fail('SERVICE_UNAVAILABLE','Configure exatamente um ano letivo ativo.');c.anoLetivoAtivo=ys[0].ano;return c}
function envelope_(fn){var requestId=Utilities.getUuid();try{return {ok:true,data:fn(),requestId:requestId}}catch(e){return {ok:false,error:{code:e.code||'SERVICE_UNAVAILABLE',message:e.code?e.message:'Serviço temporariamente indisponível. Repita a mesma tentativa ou solicite suporte com o identificador da requisição.'},requestId:requestId}}}
function locked_(fn){var lock=LockService.getScriptLock();if(!lock.tryLock(10000))IFAM.fail('BUSY_RETRY','Serviço ocupado. Tente novamente com a mesma tentativa.');try{return fn()}finally{lock.releaseLock()}}
function hash_(p){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(p),Utilities.Charset.UTF_8).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('')}
function applyOperation_(op){try{var plan=JSON.parse(op.planoJson);op.estado='EM_APLICACAO';op.atualizadoEm=now_();upsert_('Operacoes',op);plan.writes.forEach(w=>upsert_(w.table,w.row));op.estado='CONCLUIDA';op.resultadoJson=JSON.stringify(plan.data);op.atualizadoEm=now_();upsert_('Operacoes',op);return plan.data}catch(e){try{op.estado='REQUER_RECONCILIACAO';op.atualizadoEm=now_();upsert_('Operacoes',op)}catch(ignore){}IFAM.fail('OPERATION_PENDING','Gravação pendente de reconciliação. Preserve a mesma tentativa e tente novamente.')}}
function reconcile_(){var list=readTable_('Operacoes').filter(o=>o.estado!=='CONCLUIDA');list.sort((a,b)=>a.criadoEm.localeCompare(b.criadoEm)||a.id.localeCompare(b.id)).forEach(applyOperation_);return {recuperadas:list.length}}
function mutation_(name,p){return envelope_(()=>{var user=auth_();var right=name==='registrarOcorrencia'?'register':name==='registrarEncaminhamento'?'send':name==='concluirEncaminhamento'?'complete':'student';IFAM.allow(user,right);var normalized=IFAM.normalize(name,p),hash=hash_(normalized);return locked_(()=>{user=auth_();IFAM.allow(user,right);var old=readTable_('Operacoes').find(o=>o.usuarioId===user.id&&o.tipo===name&&o.chaveIdempotencia===p.chaveIdempotencia);if(old){if(old.payloadHash!==hash)IFAM.fail('IDEMPOTENCY_CONFLICT','A mesma tentativa contém dados diferentes.');return old.estado==='CONCLUIDA'?JSON.parse(old.resultadoJson):applyOperation_(old)}reconcile_();var db=loadDb_(),cfg=config_(),plan=IFAM.plan(db,user,name,normalized,{uuid:()=>Utilities.getUuid(),now:now_,policy:cfg.politicaAposLimite});var op={id:plan.id,usuarioId:user.id,tipo:name,chaveIdempotencia:p.chaveIdempotencia,payloadHash:hash,estado:'PREPARADA',planoJson:JSON.stringify(plan),resultadoJson:'',criadoEm:now_(),atualizadoEm:now_()};if(op.planoJson.length>45000)IFAM.fail('VALIDATION_ERROR','Conteúdo excede o limite técnico da operação.');upsert_('Operacoes',op);return applyOperation_(op)})})}
function registrarOcorrencia(p){return mutation_('registrarOcorrencia',p)}
function cadastrarAluno(p){return mutation_('cadastrarAluno',p)}
function atualizarAluno(p){return mutation_('atualizarAluno',p)}
function registrarEncaminhamento(p){return mutation_('registrarEncaminhamento',p)}
function concluirEncaminhamento(p){return mutation_('concluirEncaminhamento',p)}
function obterSessao(){return envelope_(()=>{var u=auth_(),c=config_();return {usuario:{id:u.id,nome:u.nome,perfil:u.perfil,ativo:u.ativo},permissoes:IFAM.RIGHTS[u.perfil],configuracoes:{campus:c.campus,anoLetivoAtivo:c.anoLetivoAtivo,fusoHorario:c.fusoHorario,politicaAposLimite:c.politicaAposLimite}}})}
function readConsistent_(fn){return envelope_(()=>{auth_();return locked_(()=>{auth_();if(readTable_('Operacoes').some(o=>o.estado!=='CONCLUIDA'))IFAM.fail('OPERATION_PENDING','Há uma gravação em processamento. Tente novamente; se persistir, solicite reconciliação administrativa.');return fn(loadDb_())})})}
function carregarDados(){return readConsistent_(db=>({Alunos:db.Alunos,Usuarios:db.Usuarios.map(u=>({id:u.id,nome:u.nome})),Ocorrencias:db.Ocorrencias,Encaminhamentos:db.Encaminhamentos,AnosLetivos:db.AnosLetivos}))}
function page_(rows,p){var limit=p.limite===undefined?25:p.limite;if(!Number.isInteger(limit)||limit<1||limit>100)IFAM.fail('VALIDATION_ERROR','Limite deve estar entre 1 e 100.');var offset=p.cursor?Number(p.cursor):0;if(!Number.isInteger(offset)||offset<0)IFAM.fail('VALIDATION_ERROR','Cursor inválido.');rows.sort((a,b)=>a.id.localeCompare(b.id));return {itens:rows.slice(offset,offset+limit),cursor:offset+limit<rows.length?String(offset+limit):null,total:rows.length}}
function year_(p){var y=Number(p.anoLetivo);if(!Number.isInteger(y)||y<1900||y>2200)IFAM.fail('VALIDATION_ERROR','Ano letivo inválido.');return y}
function matchStudent_(a,p){return (!p.busca||(a.nome+' '+a.matricula).toLowerCase().includes(String(p.busca).toLowerCase()))&&(!p.curso||p.curso===a.curso)&&(!p.turma||p.turma===a.turma)}
function listarAlunos(p){return readConsistent_(db=>{IFAM.keys(p,['busca','curso','turma','anoLetivo','limite','cursor']);var y=year_(p);return page_(db.Alunos.filter(a=>matchStudent_(a,p)).map(a=>({...a,contagem:IFAM.active(db,a.id,y).length})),p)})}
function obterAluno(p){return readConsistent_(db=>{IFAM.keys(p,['alunoId']);return IFAM.find(db,'Alunos',p.alunoId)})}
function listarOcorrencias(p){return readConsistent_(db=>{IFAM.keys(p,['alunoId','anoLetivo','inicio','fim','limite','cursor']);var y=year_(p);return page_(db.Ocorrencias.filter(o=>o.anoLetivo===y&&(!p.alunoId||o.alunoId===p.alunoId)&&(!p.inicio||o.dataHoraAbordagem>=p.inicio)&&(!p.fim||o.dataHoraAbordagem<=p.fim)),p)})}
function listarEncaminhamentos(p){return readConsistent_(db=>{IFAM.keys(p,['anoLetivo','status','busca','curso','turma','limite','cursor']);var y=year_(p);if(p.status&&!['PENDENTE','ENCAMINHADO','CONCLUIDO'].includes(p.status))IFAM.fail('VALIDATION_ERROR','Status inválido.');return page_(db.Encaminhamentos.filter(e=>e.anoLetivo===y&&(!p.status||e.status===p.status)&&matchStudent_(IFAM.find(db,'Alunos',e.alunoId),p)),p)})}
function obterEncaminhamento(p){return readConsistent_(db=>{IFAM.keys(p,['encaminhamentoId']);var e=IFAM.find(db,'Encaminhamentos',p.encaminhamentoId);return {...e,snapshot:JSON.parse(e.snapshotJson)}})}
function listarAnosLetivos(){return readConsistent_(db=>db.AnosLetivos)}
function obterResumo(p){return readConsistent_(db=>{IFAM.keys(p,['anoLetivo','inicio','fim','curso','turma']);var y=year_(p),rows=db.Ocorrencias.filter(o=>o.anoLetivo===y&&o.status==='ATIVA'&&matchStudent_(IFAM.find(db,'Alunos',o.alunoId),p)&&(!p.inicio||o.dataHoraAbordagem>=p.inicio)&&(!p.fim||o.dataHoraAbordagem<=p.fim));return {ocorrencias:rows.length,alunos:new Set(rows.map(o=>o.alunoId)).size,irregularidades:IFAM.TYPES.map(t=>({tipo:t,total:rows.filter(o=>JSON.parse(o.irregularidadesJson).includes(t)).length}))}})}
function documentData_(p,user){IFAM.keys(p,['encaminhamentoId','chaveIdempotencia']);var e=IFAM.find({Encaminhamentos:readTable_('Encaminhamentos')},'Encaminhamentos',p.encaminhamentoId);return {encaminhamento:e,snapshot:JSON.parse(e.snapshotJson),instituicao:config_(),emitidoEm:now_(),emitidoPor:user.nome}}
function auditDocument_(user,id,key){locked_(()=>{var auditId=hash_({user:user.id,id:id,key:key});if(!readTable_('Auditoria').some(a=>a.id===auditId))upsert_('Auditoria',{id:auditId,operacaoId:key,usuarioId:user.id,acao:'emitirDocumento',entidade:'Encaminhamentos',entidadeId:id,dataHora:now_(),detalhesJson:'{}'})})}
function obterDadosDocumento(p){return envelope_(()=>{var u=auth_(),d=documentData_(p,u);auditDocument_(u,p.encaminhamentoId,Utilities.getUuid());return d})}
function gerarPdfEncaminhamento(p){return envelope_(()=>{var u=auth_();IFAM.text(p.chaveIdempotencia,'chave',120,true);var d=documentData_(p,u),doc=DocumentApp.create('Encaminhamento IFAM temporário'),id=doc.getId();try{var body=doc.getBody();body.setPageWidth(595.28).setPageHeight(841.89).setMarginTop(48).setMarginBottom(48).setMarginLeft(48).setMarginRight(48);body.setAttributes({[DocumentApp.Attribute.FONT_FAMILY]:'Arial',[DocumentApp.Attribute.FONT_SIZE]:10});var logoId=PropertiesService.getScriptProperties().getProperty('LOGO_FILE_ID');if(logoId){var img=body.appendImage(DriveApp.getFileById(logoId).getBlob());var ratio=img.getHeight()/img.getWidth();img.setWidth(110).setHeight(Math.round(110*ratio))}body.appendParagraph('INSTITUTO FEDERAL DO AMAZONAS').setHeading(DocumentApp.ParagraphHeading.HEADING2);body.appendParagraph(d.instituicao.campus);body.appendParagraph('Encaminhamento ao DEP').setHeading(DocumentApp.ParagraphHeading.HEADING1);body.appendParagraph('Identificador: '+d.encaminhamento.id+'\nAno letivo: '+d.encaminhamento.anoLetivo);var a=d.snapshot.aluno;body.appendParagraph(a.nome+'\nMatrícula: '+a.matricula+'\nCurso: '+a.curso+' · Turma: '+a.turma);body.appendParagraph('O estudante atingiu três ocorrências no ano letivo indicado. Os registros abaixo motivaram o encaminhamento para acompanhamento pelo DEP.');d.snapshot.ocorrencias.forEach((o,i)=>{body.appendParagraph((i+1)+'. '+Utilities.formatDate(new Date(o.dataHoraAbordagem),d.instituicao.fusoHorario,'dd/MM/yyyy HH:mm')).setHeading(DocumentApp.ParagraphHeading.HEADING3);body.appendParagraph(JSON.parse(o.irregularidadesJson).map(t=>({CAMISA:'Camisa',CALCA:'Calça',SAPATO:'Sapato'})[t]+' fora do padrão').join('; '));body.appendParagraph('Observação: '+(o.observacao||'Sem observação.')+'\nAssistente: '+o.assistenteNome)});body.appendParagraph('Emitido em '+Utilities.formatDate(new Date(d.emitidoEm),d.instituicao.fusoHorario,'dd/MM/yyyy HH:mm')+' por '+u.nome);body.appendParagraph('\n\n________________________________________\nAssinatura do responsável');doc.saveAndClose();var blob=DriveApp.getFileById(id).getAs(MimeType.PDF),bytes=blob.getBytes();if(bytes.length>5000000)IFAM.fail('SERVICE_UNAVAILABLE','PDF excede o limite de entrega do MVP.');auditDocument_(u,p.encaminhamentoId,p.chaveIdempotencia);return {nome:'Encaminhamento-'+d.encaminhamento.id+'.pdf',mime:'application/pdf',base64:Utilities.base64Encode(bytes)}}finally{DriveApp.getFileById(id).setTrashed(true)}})}
function reconciliarOperacoes(){return envelope_(()=>{IFAM.allow(auth_(),'admin');return locked_(reconcile_)})}
function doGet() {
  try {
    auth_();

    return HtmlService
      .createHtmlOutputFromFile('Index')
      .setTitle('IFAM · Ocorrências Estudantis')
      .addMetaTag('viewport', 'width=device-width,initial-scale=1');

  } catch (e) {
    console.error(
      'Falha no doGet: ' +
      (e && e.stack ? e.stack : String(e))
    );

    return HtmlService.createHtmlOutput(
      '<!doctype html><html lang="pt-BR">' +
      '<meta charset="utf-8">' +
      '<h1>Não foi possível abrir o sistema</h1>' +
      '<p>O erro foi registrado para diagnóstico.</p>' +
      '</html>'
    );
  }
}
function setup_(){var props=PropertiesService.getScriptProperties(),admin=String(props.getProperty('INITIAL_ADMIN_EMAIL')||'').trim().toLowerCase(),active=String(Session.getActiveUser().getEmail()||'').toLowerCase();if(!admin||active!==admin)IFAM.fail('FORBIDDEN','Configure INITIAL_ADMIN_EMAIL com sua identidade verificada.');return locked_(()=>{var ss=spreadsheet_();Object.keys(SCHEMA_).forEach(name=>{var sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(sh.getLastRow()===0){sh.getRange(1,1,1,SCHEMA_[name].length).setValues([SCHEMA_[name]]);sh.setFrozenRows(1)}else if(JSON.stringify(sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0])!==JSON.stringify(SCHEMA_[name]))throw new Error('Cabeçalhos incompatíveis na aba '+name+'; nenhum dado foi apagado.')});if(!readTable_('Usuarios').length)upsert_('Usuarios',{id:Utilities.getUuid(),nome:'Administrador',email:admin,perfil:'ADMIN',ativo:true,criadoEm:now_(),atualizadoEm:now_()});if(!readTable_('AnosLetivos').length){var year=Number(props.getProperty('ANO_LETIVO_ATIVO'));if(!Number.isInteger(year)||year<2000||year>2200)throw new Error('Configure ANO_LETIVO_ATIVO explicitamente.');upsert_('AnosLetivos',{ano:year,ativoParaRegistro:true,criadoEm:now_()})}var configs={campus:props.getProperty('CAMPUS')||'Campus a definir',fusoHorario:props.getProperty('FUSO_HORARIO')||'America/Manaus',anoLetivoAtivo:String(readTable_('AnosLetivos').find(y=>y.ativoParaRegistro).ano),politicaAposLimite:'PENDENTE_DEFINICAO'},old=readTable_('Configuracoes');Object.keys(configs).forEach(k=>{if(!old.some(r=>r.chave===k))upsert_('Configuracoes',{chave:k,valor:configs[k],atualizadoEm:now_()})});return 'Setup concluído sem apagar dados.'})}
function configurarSistema() {
  try {
    console.log("Iniciando a criação das abas...");

    const resultado = setup_();

    console.log(resultado);
    console.log("Configuração concluída. Confira a planilha.");
  } catch (erro) {
    console.error("Falha na configuração: " + erro.message);
    throw erro;
  }
}
function diagnosticarAcesso() {
  console.log(
    'E-mail identificado: ' +
    (Session.getActiveUser().getEmail() || 'VAZIO')
  );

  console.log(
    'Resultado da sessão: ' +
    JSON.stringify(obterSessao())
  );
}
