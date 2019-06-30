from celery import Celery
from flask import Flask, request, jsonify

from Matsuri_translation.manger import execute_event

app = Flask(__name__)
celery = Celery(app.name, broker='redis://localhost:6379/0', backend='redis')


# celery.conf.update(app.config)


@app.route('/api/tasks', methods=['POST'])
def add_tasks():
    if request.json:
        task = {'url': request.json['url'],
                'translation': request.json['translation']}
        result = execute_event.delay(task)
        return jsonify({'task_id': result.id})


@app.route('/api/get_task', methods=['GET'])
def get_task_result():
    if request.json:
        t = celery.AsyncResult(request.json['task_id'])
        result = {'task_id': request.json['task_id'],
                  'state': celery.AsyncResult(request.json['task_id']).state,
                  'result': celery.AsyncResult(request.json['task_id']).result}
        return jsonify(result)


if __name__ == '__main__':
    app.run(debug=True)
