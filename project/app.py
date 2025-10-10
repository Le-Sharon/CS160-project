from flask import Flask, render_template, request, jsonify, make_response
import io, csv, os, json, math
import pandas as pd

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/importCSV', methods=['POST'])
def import_csv():
    return 0

@app.route('/getLayer', methods=['GET'])
def get_layer():
    """
    Fetch data from API
    There's types of layers to get: 
    airquality, weather, gbfs (get bike/scooters stations), route
    For route, support walking, driving and cycling modes
    """
    return 0

@app.route('/getBuffer', methods=['POST'])
def get_buffer():
    return 0
    
@app.route('/compareLayers', methods=['POST'])
def compare_layers():
    return 0


@app.route('/exportCSV', methods=['GET'])
def export_csv():
    return 0

if __name__ == '__main__':
    app.run(debug=True)
