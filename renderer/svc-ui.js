const $ = id => document.getElementById(id), say = t => { $('msg').textContent = t; setTimeout(() => { $('msg').textContent = ''; }, 3000); };
$('b').onclick = () => svc.back(); $('f').onclick = () => svc.forward(); $('r').onclick = () => svc.reload();
$('u').onkeydown = e => { if (e.key === 'Enter') svc.go($('u').value.trim()); };
$('ex').onclick = () => svc.external();
$('gl').onclick = async () => say('Добавлено ссылок: ' + await svc.grab('links'));
$('gs').onclick = async () => say((await svc.grab('sel')) ? 'Текст добавлен' : 'Ничего не выделено');
svc.onUrl(u => { if (document.activeElement !== $('u')) $('u').value = u; });
