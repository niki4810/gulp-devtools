$(function () {
  var MyApp = {};

  //What are geppetto context and commands (using an older version at this time, soon will upgrade)?
  // see: https://github.com/ModelN/backbone.geppetto/tree/0.6.3

  MyApp.AppEvents = function () {
    var evMap = {};
    evMap.RUN_TASK = "runTaskEvent";
    evMap.RUN_TASK_IN_BACKGROUND = "runTaskInBackgroundEvent";
    evMap.ON_TASK_ADDED_TO_BACKGROUND = "onTaskAddedToBackgroundEvent";
    evMap.ON_TASK_RUNNING = "onTaskRunningEvent";
    evMap.ON_TASK_FINISHED = "onTaskFinished";
    evMap.KILL_TASK = "killTaskEvent";
    evMap.KILL_BACKGROUND_TASK = "killBackgroundTaskEvent";
    evMap.ON_BCK_TASK_LIMIT_EXCEED = "onBackgroundTaskLimitExceeded";
    return evMap;
  }();

  //commands
  MyApp.RunTaskCommand = function () {
  };
  MyApp.RunTaskCommand.prototype.execute = function () {
    var taskName = this.eventData.taskName;
    this.context.socket.emit('runTask', {'taskName': taskName});
  };

  MyApp.KillTaskCommand = function () {
  };

  MyApp.KillTaskCommand.prototype.execute = function () {
    var pid = this.eventData.pid;
    this.context.socket.emit('killTask', {'pid': pid});
  };

  //controllers
  MyApp.ApplicationContext = Backbone.Geppetto.Context.extend({
    initialize: function () {
      this.mapCommand(MyApp.AppEvents.RUN_TASK, MyApp.RunTaskCommand);
      this.mapCommand(MyApp.AppEvents.KILL_TASK, MyApp.KillTaskCommand);
      this.mapCommand(MyApp.AppEvents.KILL_BACKGROUND_TASK, MyApp.KillTaskCommand);
    }
  });

  //views
  MyApp.BaseView = Backbone.View.extend({
    initialize: function () {
      _.bindAll.apply(_, [this].concat(_.functions(this)));
    },
    render: function () {
      var html = this.template(this.model.toJSON());
      this.$el.append(html);
    }
  });

  MyApp.CurrentTaskLiView = MyApp.BaseView.extend({
    tagName: 'li',
    template: Handlebars.compile($("#js-app-current-gulp-task-li-tmpl").html()),
    events: {
      "click a": "handleTaskClick"
    },
    initialize: function (options) {
      MyApp.BaseView.prototype.initialize.call(this);
      this.context = this.options.context;
    },
    handleTaskClick: function (ev) {
      ev.preventDefault();
      //do not allow running another task if there is already a task running
      if (this.$el.hasClass("disabled")) {
        return;
      }
      this.$el.addClass('active');
      this.context.dispatch(MyApp.AppEvents.RUN_TASK, this.model.toJSON());
    }
  });

  MyApp.CurrentTaskListView = MyApp.BaseView.extend({
    template: Handlebars.compile($("#js-app-current-gulp-tasks-tmpl").html()),
    initialize: function (options) {
      MyApp.BaseView.prototype.initialize.call(this);
      this.context = this.options.context;
      this.context.listen(this, MyApp.AppEvents.RUN_TASK, this.beforeTaskRun);
      this.context.listen(this, MyApp.AppEvents.ON_TASK_FINISHED, this.onTaskFinish);
      this.context.listen(this,MyApp.AppEvents.ON_TASK_ADDED_TO_BACKGROUND,this.onTaskAddedToBackground);
    },
    events: {
      "keyup .js-app-txt-filter": "filterTasks"
    },
    onTaskAddedToBackground: function(ev){
      this.$(".js-app-gulp-task-list li").removeClass("disabled");
      this.$(".js-app-gulp-task-list li").removeClass("active");
    },
    filterTasks: function (ev) {
      var filter = this.$(ev.currentTarget).val();
      var $filterEl = this.$(".js-app-gulp-task-list");
      if (filter) {
        $filterEl.find("a:not(:contains(" + filter + "))").parent().hide();
        $filterEl.find("a:contains(" + filter + ")").parent().show();
      } else {
        $filterEl.find("li").show();
      }
    },
    onTaskFinish: function (data) {
      if(this.context.pid === data.pid) {
        this.$(".js-app-gulp-task-list li").removeClass("disabled");
        this.$(".js-app-gulp-task-list li").removeClass("active");
      }
    },
    beforeTaskRun: function () {
      this.$(".js-app-gulp-task-list li").addClass("disabled");
    },
    render: function () {
      MyApp.BaseView.prototype.render.call(this);
      var tasks = this.model.get("tasks");
      var self = this;
      _.each(tasks, function (task) {
        var taskLiModel = new Backbone.Model({
          taskName: task
        });
        var taskLiView = new MyApp.CurrentTaskLiView({
          model: taskLiModel,
          context: self.context
        });
        taskLiView.render();
        taskLiView.$el.appendTo(self.$(".js-app-gulp-task-list"));
      });
    }
  });

  MyApp.BckTaskLiView = MyApp.BaseView.extend({
    tagName: 'li',
    template: Handlebars.compile($("#js-app-bck-gulp-task-li-tmpl").html()),
    events: {
      "click .js-app-bck-task-close": "closeBackgroundTask"
    },
    closeBackgroundTask: function (ev) {
      if (!this.model.get("pid")) {
        throw "Requested unknown task to be stopped";
      }
      this.context.dispatch(MyApp.AppEvents.KILL_BACKGROUND_TASK, this.model.toJSON());
      this.remove();
    },
    initialize: function (options) {
      MyApp.BaseView.prototype.initialize.call(this);
      this.context = this.options.context;
    }
  });

  MyApp.BckTaskListView = MyApp.BaseView.extend({
    template: Handlebars.compile($("#js-app-bck-gulp-tasks-tmpl").html()),
    initialize: function (options) {
      MyApp.BaseView.prototype.initialize.call(this);
      this.context = this.options.context;
      this.context.listen(this, MyApp.AppEvents.RUN_TASK_IN_BACKGROUND, this.handleAddBackgroundTask);
    },
    handleAddBackgroundTask: function (ev) {
      if (this.$(".js-app-bck-gulp-task-list li").length === 5) {
        this.context.dispatch(MyApp.AppEvents.ON_BCK_TASK_LIMIT_EXCEED, {});
        return;
      }
      var bckTaskLiModel = new Backbone.Model(ev);
      var bckTaskLiView = new MyApp.BckTaskLiView({
        model: bckTaskLiModel,
        context: this.context
      });
      bckTaskLiView.render();
      bckTaskLiView.$el.appendTo(self.$(".js-app-bck-gulp-task-list"));
      //TODO: find better name to reset the state
      this.context.dispatch(MyApp.AppEvents.ON_TASK_ADDED_TO_BACKGROUND,ev);
    }
  });

  MyApp.ActionBtnView = MyApp.BaseView.extend({
    template: Handlebars.compile($("#js-app-action-btn-tmpl").html()),
    events: {
      "click .js-app-btn-kill-task": "handleKillTask",
      "click .js-app-btn-bck-task": "handleRunTaskInBackground"
    },
    handleRunTaskInBackground: function (ev) {
      if (!this.model.get("pid") || !this.model.get("taskName")) {
        throw "Requested unknown task to be to be run in background";
      }
      this.context.dispatch(MyApp.AppEvents.RUN_TASK_IN_BACKGROUND, this.model.toJSON());
    },
    handleKillTask: function (ev) {
      if (!this.model.get("pid")) {
        throw "Requested unknown task to be stopped";
      }
      this.context.dispatch(MyApp.AppEvents.KILL_TASK, this.model.toJSON());
    },
    initialize: function (options) {
      MyApp.BaseView.prototype.initialize.call(this);
      this.context = this.options.context;
      this.context.listen(this, MyApp.AppEvents.ON_TASK_RUNNING, this.onTaskRunning);
      this.context.listen(this, MyApp.AppEvents.ON_TASK_FINISHED, this.onTaskFinish);
    },
    onTaskFinish: function (data) {
      if(data.pid === this.model.get("pid")) {
        this.model.unset({silent: true});
      }
    },
    //TODO: this needs refactoring, only set the model once.
    onTaskRunning: function (data) {
      this.model.unset({silent: true});
      this.model.set(data, {silent: true});
    }
  });

  MyApp.ConsoleView = MyApp.BaseView.extend({
    template: Handlebars.compile($("#js-app-console-tmpl").html()),
    initialize: function (options) {
      MyApp.BaseView.prototype.initialize.call(this);
      this.context = this.options.context;
      this.context.listen(this, MyApp.AppEvents.RUN_TASK, this.beforeTaskRun);
      this.context.listen(this, MyApp.AppEvents.ON_TASK_RUNNING, this.onTaskRunning);
      this.context.listen(this, MyApp.AppEvents.ON_BCK_TASK_LIMIT_EXCEED, this.showLimitExceedWarning);
      this.context.listen(this, MyApp.AppEvents.ON_TASK_FINISHED, this.onTaskFinish);
      this.context.listen(this,MyApp.AppEvents.ON_TASK_ADDED_TO_BACKGROUND,this.onTaskAddedToBackground);
    },
    onTaskAddedToBackground: function(){
      //clear the console.
      this.$(".js-app-console").empty();
    },
    showLimitExceedWarning: function () {
      this.$(".js-app-console").append("<div class='text-danger'>There are already 5 background running tasks, please stop one of them before adding a new one.</div>");
    },
    onTaskFinish: function (data) {
      this.$(".js-app-console").append("<div class='text-success'>" + data.message + "</div>");
    },
    onTaskRunning: function (data) {
      var paras = data.message.split('\n');
      var self = this;
      this.context.pid = data.pid;
      _.each(paras, function (para) {
        //TODO: this needs refactoring
        var $div = $("<div>" + para + "</div>");
        self.$(".js-app-console").append($div);
        $('body,html').stop().animate({
          scrollTop: $div.offset().top + 'px'
        }, 500);
      });
    },
    beforeTaskRun: function () {
      this.$(".js-app-console").empty();
    }
  });

  MyApp.MainContainerView = MyApp.BaseView.extend({
    template: Handlebars.compile($("#js-app-main-container-tmpl").html()),
    initialize: function () {
      MyApp.BaseView.prototype.initialize.call(this);
      Backbone.Geppetto.bindContext({
        view: this,
        context: MyApp.ApplicationContext
      });
      this.context.listen(this, MyApp.AppEvents.RUN_TASK, this.beforeTaskRun);
      this.context.listen(this, MyApp.AppEvents.ON_TASK_FINISHED, this.onTaskFinish);
      this.context.listen(this,MyApp.AppEvents.ON_TASK_ADDED_TO_BACKGROUND,this.onTaskAddedToBackground);
    },
    render: function () {
      MyApp.BaseView.prototype.render.call(this);
      this.constructSubViews();
    },
    onTaskAddedToBackground: function(){
      this.actionBtnView.$el.hide();
    },
    onTaskFinish: function (data) {
      if(this.context.pid === data.pid) {
        this.actionBtnView.$el.hide();
      }
    },
    beforeTaskRun: function () {
      this.actionBtnView.$el.show();
    },
    constructSubViews: function () {
      var opts = this.model.toJSON();
      //consoleView
      this.createSubView(opts, MyApp.ConsoleView, ".js-app-main");
      //background task view
      this.createSubView(opts, MyApp.BckTaskListView, ".js-app-sidebar");
      //current task view
      this.createSubView(opts, MyApp.CurrentTaskListView, ".js-app-sidebar");
      //action btn view
      this.actionBtnView = this.createSubView(opts, MyApp.ActionBtnView, ".js-app-main");
      this.actionBtnView.$el.hide();
    },
    createSubView: function (opts, view, section) {
      var currModel = new Backbone.Model(opts);
      var currView = new view({
        model: currModel,
        context: this.context
      });
      currView.render();
      currView.$el.appendTo(this.$(section));
      return currView;
    }
  });


  MyApp.HelpContainerView = MyApp.BaseView.extend({
    template: Handlebars.compile($("#js-app-help-container-tmpl").html())
  });

  MyApp.init = function () {
    var initMainView = function (data) {
      var mainContainerModel = new Backbone.Model({
        tasks: data.tasks
      });
      var mainContainerView = new MyApp.MainContainerView({
        model: mainContainerModel
      });
      MyApp.context = mainContainerView.context;
      mainContainerView.context.socket = MyApp.socket;
      mainContainerView.render();
      mainContainerView.$el.appendTo(".js-app-shell");
      return mainContainerView;
    };
    var initHelpView = function () {
      var helpContainerModel = new Backbone.Model();
      var helpContainerView = new MyApp.HelpContainerView({
        model: helpContainerModel
      });
      helpContainerView.render();
      helpContainerView.$el.appendTo(".js-app-shell");
      return helpContainerView;
    };

    var showHelpView = function () {
      if (MyApp.currentView) {
        MyApp.currentView.close();
      }
      MyApp.currentView = initHelpView();
    };


    MyApp.socket = io.connect("http://localhost:8001");

    MyApp.socket.on('connect_failed', showHelpView);

    //on socket error
    MyApp.socket.on('error', showHelpView);

    //on socket disconnected
    MyApp.socket.on('disconnect', showHelpView);


    //custom socket events
    //fired when gulp tasks are loaded
    MyApp.socket.on('onGulpTasksLoaded', function (data) {
      if (MyApp.currentView) {
        MyApp.currentView.close();
      }
      if (data.tasks && data.tasks.length > 0) {
        MyApp.currentView = initMainView(data);
        return;
      }
      MyApp.currentView = initHelpView();
    });

    //fired when gulp tasks are running and the terminal
    //logs the process output
    MyApp.socket.on('onProcessRunning', function (data) {
      if (!MyApp.context) {
        throw "application controller is not defined";
      }
      MyApp.context.dispatch(MyApp.AppEvents.ON_TASK_RUNNING, data);
    });

    //fired when gulp tasks finish executing
    MyApp.socket.on('onProcessFinish', function (data) {
      if (!MyApp.context) {
        throw "application controller is not defined";
      }
      MyApp.context.dispatch(MyApp.AppEvents.ON_TASK_FINISHED, data);
    });

    MyApp.socket.on('onProcessExit', function (data) {
      if (!MyApp.context) {
        throw "application controller is not defined";
      }
      MyApp.context.dispatch(MyApp.AppEvents.ON_TASK_FINISHED, data);
    });
  };

  MyApp.init();

});