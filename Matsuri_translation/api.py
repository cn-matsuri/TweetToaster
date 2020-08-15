from flask import Flask, request, jsonify

from .manager import execute_event, celery, execute_event_auto

app = Flask(__name__)


celery.conf.update(app.config)


@app.route('/api/tasks', methods=['POST'])
def add_tasks():
    if request.json:
        task = request.json
        result = execute_event.delay(task)
        return jsonify({'task_id': result.id})


@app.route('/api/auto', methods=['POST'])
def add_auto():
    if request.json:
        task = request.json
        result = execute_event_auto.delay(task)
        return jsonify({'task_id': result.id})


@app.route('/api/get_task=<string:task_id>', methods=['GET'])
def get_task_result(task_id):
    result = {'task_id': task_id,
              'state': celery.AsyncResult(task_id).state,
              'result': celery.AsyncResult(task_id).result}
    return jsonify(result)


if __name__ == '__main__':
    app.run(debug=True, port=8083)
