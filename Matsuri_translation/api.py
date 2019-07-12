from celery import Celery
from flask import Flask, request, jsonify
from flask_cors import CORS

from manger import execute_event

app = Flask(__name__)
celery = Celery(app.name, broker='redis://localhost:6380/0', backend='redis')
CORS(app)


# celery.conf.update(app.config)


@app.route('/api/tasks', methods=['POST'])
def add_tasks():
    if request.json:
        task = {'url': request.json['url'],
                'translation': request.json['translation']}
        result = execute_event.delay(task)
        return jsonify({'task_id': result.id})


@app.route('/api/get_task=<string:task_id>', methods=['GET'])
def get_task_result(task_id):
    result = {'task_id': task_id,
              'state': celery.AsyncResult(task_id).state,
              'result': celery.AsyncResult(task_id).result}
    return jsonify(result)


if __name__ == '__main__':
    app.run(debug=True, port=8083)
