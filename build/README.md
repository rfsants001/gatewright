# Ícones Gatewright

A fonte é `icon.svg`, baseada na marca G usada pelo desktop e pelos banners atuais: rosa `#fd82c6` sobre grafite ameixa `#2b1727`, contorno `#63354f` e margem transparente. Não usar o placeholder anterior.

Artefatos versionados:

- `icon.png`: 1024 × 1024, janela Electron e dock macOS em desenvolvimento.
- `icon.ico`: 16, 24, 32, 48, 64, 128 e 256 px, Windows/NSIS.
- `icon.icns`: conjunto nativo macOS até 1024 px, app/DMG.
- `icons/*.png`: 16–512 px, pacotes e tema hicolor Linux.

O build normal apenas copia esses arquivos; não exige ferramentas de imagem. Para regenerar depois de editar o SVG, instale Pillow e CairoSVG em um ambiente Python de desenvolvimento e execute `python3 scripts/generate-icons.py`. Confira visualmente antes de versionar.

A identidade Linux é `io.gatewright.Desktop` no executável empacotado, no .desktop, no StartupWMClass e no tema de ícones. `npm run desktop:install` instala o atalho e os tamanhos no XDG_DATA_HOME do usuário, usando o checkout/Node atuais. Reexecute para substituir o ícone antigo; feche e reabra o aplicativo. Os instaladores permanentes usam os recursos do pacote. No Windows, o processo usa o mesmo AppUserModelID; no macOS o bundle recebe ICNS e a janela de desenvolvimento atualiza o dock.
