# VA+Embeddings Browser

Deployed at https://va-embeddings-browser.ivis.itn.liu.se/ 




## Project Structure

- `/data/categories.json` – hierarchical list of category names and corresponding icons
- `/data/content.json` – list of entries; ID fields are used to index corresponding files in thumbs and bibtex directories

- `/bibtex` - BiBTeX files for the survey entries
- `/thumbs100` - smaller thumbnails used in the main grid view
- `/thumbs200` - larger thumbnails used in the details dialog

- `/css` - CSS style sheets
- `/fonts` - glyph fonts required by Bootstrap
- `/images` - various icons used by UI (including SVG source files)
- `/js` - JavaScript files
- `/js/{html5shiv.js,respond.min.js}` - scripts required by Bootstrap
- `/js/va-embeddings-browser.js` - **main custom script**

- `sync.sh` - script for uploading updated files to the target server attached via SMB (must NOT be deployed to a running instance of the project!)

- `/doc-internal` - documentation and scripts used for project development and survey data analyses (must NOT be deployed to a running instance of the project!) 
- `/doc-internal/lib` - dependencies for the internal scripts
- `/doc-internal/parse_csv_data.py` - script for parsing the CSV data exported from Google Docs / Excel spreadsheet with papers description
- `/doc-internal/conduct_topic_modeling_bib_data_bertopic.py` - script for conducting topic modeling with BERTopic, based on the abstracts from BiBTeX files
- `/doc-internal/conduct_topic_modeling_bib_data_traditional.py` - script for conducting topic modeling with LDA or HDP using Gensim, based on the abstracts from BiBTeX files
- `/doc-internal/data-analyses.html` - HTML file with inline JavaScript code for various survey data analyses (replacing, more or less, similar analyses within the main JS script)
- `/doc-internal/bibitems_to_ids.csv` - CSV file generated from the survey article BBL file; used by `data-analyses` to generate a table with paper citation keys compatible with the survey article
- `/doc-internal/split_bib_data.py` - helper script for splitting the original joint BibTeX file into separate files named after the BiB keys




