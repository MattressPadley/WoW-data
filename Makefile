# Define the target for generating the report
report:
	@echo "Running report generation tasks..."
	mkdir -p gear_prog/img
	python3 gear_prog/gear_prog_chart.py
	python3 gear_prog/gear_source_table.py
	python3 gear_prog/crest_source_table.py
	python3 gear_prog/make_gear_report.py
	@echo "Report generation complete."


