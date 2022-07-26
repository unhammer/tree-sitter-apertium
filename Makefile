all: langs logs/py

LOGS = logs/cg logs/lexc logs/lexd logs/rtx logs/twolc logs/xfst
TESTS = logs/cg.test logs/lexc.test logs/lexd.test \
        logs/rtx.test logs/twolc.test logs/xfst.test
PYDEPS = python/setup.py python/MANIFEST.in python/README python/build.sh

langs: $(LOGS)
test: $(TESTS)

logs/.log:
	mkdir -p logs
	touch $@

logs/%: tree-sitter-%/package.json tree-sitter-%/grammar.js logs/.log
	(cd "tree-sitter-$*" && tree-sitter generate) > $@

logs/lexc: logs/xfst tree-sitter-lexc/package.json tree-sitter-lexc/grammar.js
	(cd tree-sitter-lexc && tree-sitter generate) > $@

logs/xfst: tree-sitter-xfst/package.json tree-sitter-xfst/grammar.js logs/.log
	(cd tree-sitter-xfst && tree-sitter generate && npm install --save .) > $@

logs/py: $(PYDEPS) $(LOGS)
	(cd python && ./build.sh) > $@

logs/%.test: logs/%
	(cd "tree-sitter-$*" && tree-sitter test)