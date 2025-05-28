#!/bin/bash

# Script used by Kostiantyn to synchronize the updated files (especially thumbnails and Bib entries) to the server,
# while double-checking for a different version of the content file (to avoid overwriting a more recent version)
# Designed and used with macOS, assuming that the server directory is currently attached via Samba

SRC=~/Coding/projects/vscode-workspace-isovis/va-embeddings-browser
DEST=/Volumes/va-embeddings-browser

if [[ ! -d $DEST ]]; then
	echo "Error: the destination directory is unavailable"
	exit 1
fi
	

rsync -ah --cvs-exclude $SRC/{bibtex,css,fonts,images,js,thumbs100,thumbs200,index.html} $DEST/
rsync -ah $SRC/data/categories.json $DEST/data/

# Note that this requires GNU diff and will probably not work with Apple diff
comp=$(diff --unchanged-line-format= --old-line-format= --new-line-format='%L' $SRC/data/content.json $DEST/data/content.json) trimmed=$(echo -n $comp)

if [[ -n $trimmed ]]; then
	echo "Content modified on server: $comp";
else
	rsync -ah $SRC/data/content.json $DEST/data/
fi
