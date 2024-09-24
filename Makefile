# Define the target for generating the report
report:
	@echo "Running report generation tasks..."
	python3 gear_prog/gear_prog_chart.py
	python3 gear_prog/gear_source_table.py
	python3 gear_prog/generate_combined_report.py
	@echo "Report generation complete."


