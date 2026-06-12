import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AssignTaskDto } from './dto/assign-task.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { ExtendTaskDto } from './dto/extend-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { ReassignTaskDto } from './dto/reassign-task.dto';
import { TaskCommentResponseDto } from './dto/task-comment-response.dto';
import {
  TaskDetailResponseDto,
  TaskResponseDto,
} from './dto/task-response.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskCommentsService } from './task-comments.service';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskCommentsService: TaskCommentsService,
  ) {}

  @Post()
  create(@Body() dto: CreateTaskDto): Promise<TaskResponseDto> {
    return this.tasksService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryTasksDto): Promise<TaskResponseDto[]> {
    return this.tasksService.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TaskDetailResponseDto> {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.update(id, dto);
  }

  @Post(':id/assign')
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.assign(id, dto);
  }

  @Post(':id/reassign')
  reassign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReassignTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.reassign(id, dto);
  }

  @Post(':id/extend')
  extend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.extend(id, dto);
  }

  @Post(':id/complete')
  complete(@Param('id', ParseIntPipe) id: number): Promise<TaskResponseDto> {
    return this.tasksService.complete(id);
  }

  @Post(':id/status')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStatusDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.changeStatus(id, dto);
  }

  @Get(':id/comments')
  listComments(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TaskCommentResponseDto[]> {
    return this.taskCommentsService.list(id);
  }

  @Post(':id/comments')
  addComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTaskCommentDto,
  ): Promise<TaskCommentResponseDto> {
    // La web solo la usa el admin: el autor siempre es el dueño.
    return this.taskCommentsService.add(id, { type: 'DUENO' }, dto.text);
  }
}
